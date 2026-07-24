import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getMe, logout, getPortfolio, getWallets, createWallet } from './api';
import { ProtectedShell } from './layout/ProtectedShell';
import type { ShellContext } from './layout/ShellContext';
import { LandingRoute } from './routes/LandingRoute';
import { HomePage } from './routes/HomePage';
import { LayerPlaceholderPage } from './routes/LayerPlaceholderPage';
import { RendaPage } from './routes/RendaPage';
import { DespesasPage } from './routes/DespesasPage';
import { CriptoPage } from './routes/CriptoPage';
import { CarteirasPage } from './routes/CarteirasPage';
import { DashboardPage } from './routes/DashboardPage';
import { AdminRoute } from './routes/AdminRoute';
import type { User, Wallet, PortfolioSummary, NewWallet } from '@vetor-wallet/shared';
import { getStoredTheme, setTheme as applyAndPersistTheme, type Theme } from './theme';

/**
 * Shell v4 (T-004): estrutura de navegação por rotas (`react-router-dom` v7)
 * substituindo a tela única anterior. Estado de sessão/tema/carteiras
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
  // Mecânica de tema centralizada em web/src/theme.ts (T-003); a aplicação
  // inicial no <html> acontece em main.tsx (initTheme) e no pré-paint do
  // index.html — aqui só espelhamos o valor em estado para re-render.
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletSummaries, setWalletSummaries] = useState<Record<number, PortfolioSummary>>({});

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
    getMe().then(setUser).catch(() => setUser(null));
  }, []);

  const refreshWallets = useCallback(async () => {
    const ws = await getWallets();
    setWallets(ws);

    // Busca portfolio de cada carteira em paralelo (para exibir nos cards)
    const results = await Promise.allSettled(ws.map((w) => getPortfolio(w.id).then((s) => ({ id: w.id, s }))));
    const summaries: Record<number, PortfolioSummary> = {};
    results.forEach((r) => { if (r.status === 'fulfilled') summaries[r.value.id] = r.value.s; });
    setWalletSummaries(summaries);
  }, []);

  useEffect(() => {
    if (user && user !== 'loading') {
      refreshWallets();
    }
  }, [user, refreshWallets]);

  async function handleCreateWallet(data: NewWallet) {
    const w = await createWallet(data);
    setWallets((prev) => [...prev, w]);
    getPortfolio(w.id)
      .then((s) => setWalletSummaries((prev) => ({ ...prev, [w.id]: s })))
      .catch(() => null);
  }

  function handleAuth(u: User) {
    setUser(u);
    navigate('/home', { replace: true });
  }

  function handleSelectWallet(wallet: Wallet) {
    navigate(`/dash/${wallet.id}`);
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setWallets([]);
    setWalletSummaries({});
    navigate('/', { replace: true });
  }

  function buildShellContext(u: User): ShellContext {
    return {
      user: u,
      theme,
      wallets,
      walletSummaries,
      onCreateWallet: handleCreateWallet,
      onSelectWallet: handleSelectWallet,
      refreshWallets,
    };
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<LandingRoute user={user} theme={theme} onToggleTheme={toggleTheme} onAuth={handleAuth} />}
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
        <Route
          path="/poupanca"
          element={<LayerPlaceholderPage title="Poupança" subtitle="Saldo, aportes e rendimento" />}
        />
        <Route
          path="/metas"
          element={<LayerPlaceholderPage title="Metas" subtitle="Progresso dos seus objetivos" />}
        />
        <Route path="/cripto" element={<CriptoPage />} />
        <Route path="/carteiras" element={<CarteirasPage />} />
        <Route path="/dash/:id" element={<DashboardPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
