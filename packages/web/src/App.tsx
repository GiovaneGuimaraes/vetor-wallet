import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { getMe, logout, getPortfolio, getWallets, createWallet } from './api';
import { ProtectedShell } from './layout/ProtectedShell';
import type { ShellContext } from './layout/ShellContext';
import { LandingRoute } from './routes/LandingRoute';
import { HomePage } from './routes/HomePage';
import { RendaPage } from './routes/RendaPage';
import { DespesasPage } from './routes/DespesasPage';
import { PoupancaPage } from './routes/PoupancaPage';
import { MetasPage } from './routes/MetasPage';
import { CriptoPage } from './routes/CriptoPage';
import { DashboardPage } from './routes/DashboardPage';
import { PlanosPage } from './routes/PlanosPage';
import { ContaPage } from './routes/ContaPage';
import { AdminRoute } from './routes/AdminRoute';
import { decideWalletFlow, resolvePrimaryWallet } from './routes/walletFlow';
import { shouldNavigateToPlans } from './routes/billingNavigation';
import type { User, Wallet, PortfolioSummary } from '@vetor-wallet/shared';
import { getStoredTheme, setTheme as applyAndPersistTheme, type Theme } from './theme';

/**
 * Shell v4 (T-004): estrutura de navegação por rotas (`react-router-dom` v7)
 * substituindo a tela única anterior. Estado de sessão/tema/carteira
 * permanece centralizado aqui (sem gerenciador de estado externo, conforme
 * CLAUDE.md) e é repassado às rotas protegidas via `ShellContext`
 * (`web/src/layout/ShellContext.ts`, consumido com `useOutletContext`).
 *
 * Guard de autenticação: não logado em rota protegida → redireciona para
 * `/` (ver `ProtectedShell`); logado em `/` → redireciona para `/home`
 * (ver `LandingRoute`).
 */
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  // Mecânica de tema centralizada em web/src/theme.ts (T-003); a aplicação
  // inicial no <html> acontece em main.tsx (initTheme) e no pré-paint do
  // index.html — aqui só espelhamos o valor em estado para re-render.
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [user, setUser] = useState<User | null | 'loading'>('loading');
  // T-050b: carteira única — um objeto, não uma lista; um summary, não um mapa.
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [walletLoadError, setWalletLoadError] = useState(false);
  const [walletSummary, setWalletSummary] = useState<PortfolioSummary | null>(null);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyAndPersistTheme(next);
  }

  // Listen for 401s from any API call and redirect to login
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // T-072: 402 SUBSCRIPTION_REQUIRED (ver `api.ts`) manda o usuário para a
  // vitrine de planos. Guarda contra rajada: se o evento disparar de novo
  // enquanto já estamos em `/planos` (ex.: várias chamadas 402 em paralelo),
  // não empilha navegações — `location.pathname` é lido dentro do handler via
  // ref para não precisar recriar o listener a cada troca de rota.
  const pathnameRef = useRef(location.pathname);
  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const handler = () => {
      if (shouldNavigateToPlans(pathnameRef.current)) {
        navigate('/planos');
      }
    };
    window.addEventListener('billing:subscription-required', handler);
    return () => window.removeEventListener('billing:subscription-required', handler);
  }, [navigate]);

  /**
   * T-050b: uma busca de carteira + UM `getPortfolio()` (sem id — desde a
   * T-050a o server ignora `?walletId=` e agrega tudo do usuário). Numa base
   * legada com 2+ carteiras, `resolvePrimaryWallet` escolhe só o RÓTULO
   * exibido; o portfolio continua sendo o consolidado.
   *
   * T-054 (achado das revisões T-049/T-050b): as duas buscas rodam em
   * promises INDEPENDENTES, não uma aninhada dentro da outra. Antes,
   * `getPortfolio()` vivia num `try` aninhado DENTRO do `try` de
   * `getWallets()` — o que parecia isolar a falha do portfolio, mas se o
   * próprio `getWallets()` rejeitasse, a execução pulava direto pro `catch`
   * externo e `getPortfolio()` nunca chegava a ser chamado, zerando o card
   * "Ações" da Home só porque o RÓTULO da carteira falhou (o portfolio é do
   * usuário, não da carteira). `walletLoadError` continua refletindo só o
   * resultado de `getWallets()` — uma falha do portfolio não o seta.
   */
  const refreshWallet = useCallback(async () => {
    const walletPromise = (async () => {
      try {
        const ws = await getWallets();
        setWallet(resolvePrimaryWallet(ws));
        // T-027: só sinaliza sucesso real — `walletLoadError` fica limpo
        // apenas quando `getWallets()` de fato resolveu, para não mascarar
        // uma falha anterior atrás de uma tentativa que ainda nem terminou.
        setWalletLoadError(false);
      } catch {
        // T-027 (achado do revisor): NÃO tocamos em `wallet` aqui. Se essa
        // foi a primeira carga da sessão, `wallet` permanece `null` — e é
        // exatamente essa ambiguidade ("null real" vs "null por falha de
        // rede") que `walletLoadError` existe para desfazer. `decideWalletFlow`
        // trata `walletLoadError && wallet === null` como estado de erro,
        // nunca como "crie a carteira automaticamente".
        setWalletLoadError(true);
      }
    })();

    const portfolioPromise = (async () => {
      try {
        setWalletSummary(await getPortfolio());
      } catch {
        /* card de ações fica com o valor anterior; nada a sinalizar aqui */
      }
    })();

    await Promise.all([walletPromise, portfolioPromise]);
    // Marcado mesmo em erro — senão o dashboard ficaria travado em
    // "carregando" para sempre após uma falha de rede; a distinção entre
    // "carregou e não tem" e "falhou ao carregar" fica por conta de
    // `walletLoadError`, não de `walletLoaded`.
    setWalletLoaded(true);
  }, []);

  useEffect(() => {
    if (user && user !== 'loading') {
      refreshWallet();
    }
  }, [user, refreshWallet]);

  /**
   * T-050b: o auto-create da carteira padrão foi internalizado aqui (antes
   * vivia na `CarteirasPage`, removida) — não há mais tela de carteiras para
   * dispará-lo. É caminho de exceção: desde a T-050a o `createUser` já cria a
   * padrão e o `GET /api/wallets` faz lazy-create; sobra para bases anteriores.
   * `creatingRef` (preservado da T-027) evita o loop de POSTs enquanto a
   * criação está em voo e o estado ainda não refletiu a carteira nova.
   */
  const creatingRef = useRef(false);

  useEffect(() => {
    if (decideWalletFlow(wallet, walletLoaded, walletLoadError) !== 'create') return;
    if (creatingRef.current) return;
    creatingRef.current = true;
    createWallet({ name: 'Principal', description: '', color: '#e3d5b8' })
      .then((w) => setWallet(w))
      .catch(() => setWalletLoadError(true))
      .finally(() => {
        creatingRef.current = false;
      });
  }, [wallet, walletLoaded, walletLoadError]);

  function handleAuth(u: User) {
    setUser(u);
    navigate('/home', { replace: true });
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setWallet(null);
    setWalletSummary(null);
    setWalletLoaded(false);
    setWalletLoadError(false);
    navigate('/', { replace: true });
  }

  function buildShellContext(u: User): ShellContext {
    return {
      user: u,
      theme,
      wallet,
      walletLoaded,
      walletLoadError,
      walletSummary,
      refreshWallet,
      onUserUpdated: setUser,
    };
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LandingRoute user={user} theme={theme} onToggleTheme={toggleTheme} onAuth={handleAuth} />
        }
      />
      <Route path="/admin" element={<AdminRoute user={user} onLogout={handleLogout} />} />

      <Route
        element={
          <ProtectedShell
            user={user}
            theme={theme}
            onToggleTheme={toggleTheme}
            onLogout={handleLogout}
            buildShellContext={buildShellContext}
          />
        }
      >
        <Route path="/home" element={<HomePage />} />
        <Route path="/renda" element={<RendaPage />} />
        <Route path="/despesas" element={<DespesasPage />} />
        <Route path="/poupanca" element={<PoupancaPage />} />
        <Route path="/metas" element={<MetasPage />} />
        <Route path="/cripto" element={<CriptoPage />} />
        <Route path="/dash" element={<DashboardPage />} />
        <Route path="/planos" element={<PlanosPage />} />
        <Route path="/conta" element={<ContaPage />} />
        {/* T-050b: bookmarks antigos do fluxo multi-carteira. `/carteiras` e
            `/dash/:id` não existem mais — a carteira é única e o dashboard não
            recebe id. Redirect em vez de 404 para não quebrar link salvo. */}
        <Route path="/dash/:id" element={<Navigate to="/dash" replace />} />
        <Route path="/carteiras" element={<Navigate to="/dash" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
