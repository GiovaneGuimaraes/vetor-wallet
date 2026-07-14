import { useEffect, useState, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  getMe,
  logout,
  getOperations,
  createOperation,
  deleteOperation,
  getPortfolio,
  getAlertRules,
  getBenchmarks,
  getWallets,
  createWallet,
} from './api';
import { OperationForm } from './components/OperationForm';
import { OperationsList } from './components/OperationsList';
import { PortfolioDashboard } from './components/PortfolioDashboard';
import { CsvImport } from './components/CsvImport';
import { AlertsPanel } from './components/AlertsPanel';
import { BenchmarkComparison } from './components/BenchmarkComparison';
import { AuthPage } from './components/AuthPage';
import { WalletSelector } from './components/WalletSelector';
import { AdminPage } from './components/AdminPage';
import { evaluateAlerts, type TriggeredAlert } from './utils/alerts';
import type {
  NewOperation,
  Operation,
  PortfolioSummary,
  AlertRule,
  BenchmarkData,
  User,
  Wallet,
  NewWallet,
} from '@vetor-wallet/shared';

function resolveInitialTheme(): 'dark' | 'light' {
  try {
    const stored = localStorage.getItem('vw-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* noop */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const location = useLocation();
  const [theme, setTheme] = useState<'dark' | 'light'>(resolveInitialTheme);

  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWallet, setActiveWallet] = useState<Wallet | null>(() => {
    try {
      const saved = localStorage.getItem('vw-active-wallet');
      return saved ? (JSON.parse(saved) as Wallet) : null;
    } catch {
      return null;
    }
  });
  const [screen, setScreen] = useState<'wallets' | 'dashboard'>('wallets');

  const [walletSummaries, setWalletSummaries] = useState<Record<number, PortfolioSummary>>({});

  const [operations, setOperations] = useState<Operation[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData | null>(null);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [apiError, setApiError] = useState('');

  // Sync theme class on mount and on change
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('light', next === 'light');
    try {
      localStorage.setItem('vw-theme', next);
    } catch {
      /* noop */
    }
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

  const refresh = useCallback(async (walletId?: number) => {
    setApiError('');
    try {
      const [ops, port, rules] = await Promise.all([
        getOperations(walletId),
        getPortfolio(walletId),
        getAlertRules(),
      ]);
      setOperations(ops);
      setPortfolio(port);
      setAlertRules(rules);
      setTriggeredAlerts(evaluateAlerts(rules, port));
      getBenchmarks().then(setBenchmarks).catch(() => null);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Erro ao conectar com a API');
    } finally {
      setLoadingData(false);
    }
  }, []);

  async function loadWallets() {
    const ws = await getWallets();
    setWallets(ws);

    // Busca portfolio de cada carteira em paralelo (para exibir nos cards)
    const results = await Promise.allSettled(ws.map((w) => getPortfolio(w.id).then((s) => ({ id: w.id, s }))));
    const summaries: Record<number, PortfolioSummary> = {};
    results.forEach((r) => { if (r.status === 'fulfilled') summaries[r.value.id] = r.value.s; });
    setWalletSummaries(summaries);

    if (activeWallet && ws.find((w) => w.id === activeWallet.id)) {
      setScreen('dashboard');
      refresh(activeWallet.id);
    }
  }

  useEffect(() => {
    if (user && user !== 'loading') {
      loadWallets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleSelectWallet(wallet: Wallet) {
    setActiveWallet(wallet);
    try {
      localStorage.setItem('vw-active-wallet', JSON.stringify(wallet));
    } catch {
      /* noop */
    }
    setScreen('dashboard');
    setLoadingData(true);
    refresh(wallet.id);
  }

  function handleBackToWallets() {
    setScreen('wallets');
    // Rebusca summaries em background para refletir operações adicionadas no dashboard
    Promise.allSettled(wallets.map((w) => getPortfolio(w.id).then((s) => ({ id: w.id, s })))).then(
      (results) => {
        const summaries: Record<number, PortfolioSummary> = {};
        results.forEach((r) => { if (r.status === 'fulfilled') summaries[r.value.id] = r.value.s; });
        setWalletSummaries(summaries);
      },
    );
  }

  async function handleCreateWallet(data: NewWallet) {
    const w = await createWallet(data);
    setWallets((prev) => [...prev, w]);
    // Busca portfolio da nova carteira (vazia, mas mantém consistência)
    getPortfolio(w.id)
      .then((s) => setWalletSummaries((prev) => ({ ...prev, [w.id]: s })))
      .catch(() => null);
  }

  async function handleAuth(u: User) {
    setUser(u);
    const ws = await getWallets();
    setWallets(ws);
  }

  async function handleCreate(op: NewOperation) {
    await createOperation(op, activeWallet?.id);
    await refresh(activeWallet?.id);
  }

  async function handleDelete(id: number) {
    await deleteOperation(id);
    await refresh(activeWallet?.id);
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setWallets([]);
    setActiveWallet(null);
    setScreen('wallets');
    setOperations([]);
    setPortfolio(null);
    setBenchmarks(null);
    setAlertRules([]);
    setTriggeredAlerts([]);
    try {
      localStorage.removeItem('vw-active-wallet');
    } catch {
      /* noop */
    }
  }

  if (user === 'loading') {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <p className="text-sm text-dim">Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuth={handleAuth} theme={theme} onToggle={toggleTheme} />;
  }

  if (location.pathname === '/admin') {
    return <AdminPage user={user} onLogout={handleLogout} />;
  }

  if (screen === 'wallets') {
    return (
      <WalletSelector
        user={user}
        wallets={wallets}
        walletSummaries={walletSummaries}
        onSelect={handleSelectWallet}
        onLogout={handleLogout}
        theme={theme}
        onToggle={toggleTheme}
        onCreateWallet={handleCreateWallet}
      />
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header
        className="sticky top-0 z-10 border-b border-edge/50 px-6 py-4 md:px-10 backdrop-blur"
        style={{ background: 'var(--header-bg)' }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: wordmark + wallet chip */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-accent">Vetor Wallet</h1>
            {activeWallet && (
              <button
                onClick={handleBackToWallets}
                className="flex items-center gap-1.5 bg-raised border border-edge rounded-full px-3 py-1 text-xs text-ink hover:border-accent/50 transition-colors cursor-pointer"
                title="Trocar carteira"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: activeWallet.color }}
                />
                <span>{activeWallet.name}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-dim"
                >
                  <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                </svg>
              </button>
            )}
          </div>

          {/* Right: theme toggle + email + logout */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-1.5 text-dim hover:text-ink transition-colors cursor-pointer rounded-md hover:bg-raised"
              aria-label="Alternar tema"
            >
              {theme === 'dark' ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>
            {user.roles.includes('admin') && (
              <Link
                to="/admin"
                className="text-xs text-dim hover:text-ink transition-colors"
              >
                Admin
              </Link>
            )}
            <span className="text-xs text-dim hidden sm:block">{user.email}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-dim hover:text-ink transition-colors cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {apiError && (
        <div className="max-w-7xl mx-auto px-6 md:px-10 pt-4">
          <div className="bg-down/10 border border-down/30 text-down rounded-lg px-4 py-3 text-sm">
            {apiError} — verifique se o servidor está rodando em{' '}
            <code className="font-mono text-xs bg-down/10 px-1.5 py-0.5 rounded">
              http://localhost:3001
            </code>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 md:px-10 py-6 flex flex-col gap-5">
        <OperationForm onSubmit={handleCreate} />
        <CsvImport walletId={activeWallet?.id} onSuccess={() => refresh(activeWallet?.id)} />
        <AlertsPanel rules={alertRules} onUpdate={() => refresh(activeWallet?.id)} />

        {loadingData ? (
          <div className="text-center py-16 text-dim text-sm">Carregando...</div>
        ) : (
          <>
            {triggeredAlerts.length > 0 && (
              <div className="bg-warn/10 border border-warn/40 rounded-xl p-5">
                <p className="text-xs font-semibold text-warn uppercase tracking-wide mb-3">
                  ⚠ {triggeredAlerts.length} alerta
                  {triggeredAlerts.length !== 1 ? 's' : ''} disparado
                  {triggeredAlerts.length !== 1 ? 's' : ''}
                </p>
                <ul className="space-y-1.5">
                  {triggeredAlerts.map((a) => (
                    <li key={a.rule.id} className="text-sm text-ink">
                      {a.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <PortfolioDashboard summary={portfolio} />
            {benchmarks && <BenchmarkComparison data={benchmarks} />}
            <OperationsList operations={operations} onDelete={handleDelete} />
          </>
        )}
      </main>
    </div>
  );
}
