import { useState } from 'react';
import { Link } from 'react-router-dom';
import { runInsightsJob } from '../api';
import type { User } from '@vetor-wallet/shared';

interface InsightsJobSummary {
  tickersProcessed: number;
  saved: number;
  duplicated: number;
  failed: number;
}

interface Props {
  user: User;
  onLogout: () => Promise<void>;
}

export function AdminPage({ user, onLogout }: Props) {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [summary, setSummary] = useState<InsightsJobSummary | null>(null);
  const [error, setError] = useState('');

  const isAdmin = user.roles.includes('admin');

  async function handleRunJob() {
    setLoading(true);
    setError('');
    setSummary(null);
    try {
      const result = await runInsightsJob(date || undefined);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar o job');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header
        className="sticky top-0 z-10 border-b border-edge/50 px-6 py-4 md:px-10 backdrop-blur"
        style={{ background: 'var(--header-bg)' }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-lg font-semibold tracking-tight text-accent hover:opacity-80 transition-opacity"
            >
              Vetor Wallet
            </Link>
            <span className="text-xs text-dim bg-raised border border-edge rounded-full px-3 py-1">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-dim hidden sm:block">{user.email}</span>
            <button
              onClick={onLogout}
              className="text-xs text-dim hover:text-ink transition-colors cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-10 py-8">
        {!isAdmin ? (
          <div className="bg-raised border border-edge rounded-xl p-8 text-center">
            <p className="text-ink font-medium mb-1">Acesso restrito</p>
            <p className="text-sm text-dim">
              Você não tem permissão para acessar esta página.
            </p>
            <Link to="/" className="mt-4 inline-block text-sm text-accent hover:opacity-80 transition-opacity">
              ← Voltar ao app
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-5 max-w-lg">
            <div>
              <h2 className="text-lg font-semibold text-ink">Painel administrativo</h2>
              <p className="text-sm text-dim mt-1">Operações manuais disponíveis apenas para admins.</p>
            </div>

            <div className="bg-raised border border-edge rounded-xl p-6 flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-ink">Job de insights de cotações</p>
                <p className="text-xs text-dim mt-0.5">
                  Busca o fechamento diário de ontem para cada ativo da carteira e salva no banco.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setSummary(null); }}
                  disabled={loading}
                  className="w-full sm:w-auto px-3 py-2 rounded-lg border border-edge bg-canvas text-ink text-sm
                             focus:outline-none focus:border-accent/60 disabled:opacity-50
                             [color-scheme:dark] dark:[color-scheme:dark]"
                />
                <button
                  onClick={handleRunJob}
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-accent text-canvas text-sm font-medium
                             hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity cursor-pointer"
                >
                  {loading ? 'Executando…' : 'Rodar job'}
                </button>
              </div>
              {!date && (
                <p className="text-xs text-dim -mt-2">Sem data selecionada, usa ontem por padrão.</p>
              )}

              {error && (
                <div className="bg-down/10 border border-down/30 text-down rounded-lg px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              {summary && (
                <div className="bg-canvas border border-edge rounded-lg px-4 py-3 text-sm flex flex-col gap-1">
                  <p className="font-medium text-ink mb-1">Resultado</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-dim">
                    <span>Tickers processados</span>
                    <span className="text-ink font-medium">{summary.tickersProcessed}</span>
                    <span>Salvos</span>
                    <span className="text-ink font-medium">{summary.saved}</span>
                    <span>Duplicatas</span>
                    <span className="text-ink font-medium">{summary.duplicated}</span>
                    {summary.failed > 0 && (
                      <>
                        <span className="text-down">Falhas</span>
                        <span className="text-down font-medium">{summary.failed}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Link to="/" className="text-sm text-dim hover:text-ink transition-colors">
              ← Voltar ao app
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
