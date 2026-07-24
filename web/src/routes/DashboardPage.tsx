import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getOperations,
  createOperation,
  deleteOperation,
  getPortfolio,
  getAlertRules,
} from '../api';
import { OperationForm } from '../components/OperationForm';
import { OperationsList } from '../components/OperationsList';
import { PortfolioDashboard } from '../components/PortfolioDashboard';
import { CsvImport } from '../components/CsvImport';
import { AlertsPanel } from '../components/AlertsPanel';
import { evaluateAlerts, type TriggeredAlert } from '../utils/alerts';
import { useShellContext } from '../layout/ShellContext';
import type { NewOperation, Operation, PortfolioSummary, AlertRule } from '@vetor-wallet/shared';

/**
 * Rota `/dash/:id` (T-004/T-013): dashboard da carteira de ações — mesma
 * funcionalidade que existia em App.tsx (tela única), agora auto-contida e
 * disparada pelo id da URL em vez de estado local `activeWallet`/`screen`.
 *
 * T-013 (design v4, tela 5): removidos do render os gráficos de
 * evolução/alocação/comparativo e o `BenchmarkComparison` — o serviço e a
 * rota `/api/benchmarks` do server permanecem intactos no backend, só saem
 * da UI (o front deixou de chamar `getBenchmarks()`, que não é usado por
 * nenhuma outra tela deste ciclo).
 */
export function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const walletId = id ? Number(id) : undefined;
  const navigate = useNavigate();
  const { wallets, refreshWallets } = useShellContext();
  const wallet = wallets.find((w) => w.id === walletId);

  const [operations, setOperations] = useState<Operation[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [apiError, setApiError] = useState('');

  const refresh = useCallback(async () => {
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
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Erro ao conectar com a API');
    } finally {
      setLoadingData(false);
    }
  }, [walletId]);

  useEffect(() => {
    setLoadingData(true);
    refresh();
  }, [refresh]);

  async function handleCreate(op: NewOperation) {
    await createOperation(op, walletId);
    await refresh();
  }

  async function handleDelete(opId: number) {
    await deleteOperation(opId);
    await refresh();
  }

  async function handleImportSuccess() {
    await refresh();
    void refreshWallets();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/carteiras')}
          className="flex items-center gap-1.5 bg-raised border border-edge rounded-full px-3 py-1 text-xs text-ink hover:border-accent/50 transition-colors cursor-pointer min-w-0"
          title="Trocar carteira"
        >
          {wallet && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: wallet.color }}
            />
          )}
          <span className="truncate max-w-[200px]">{wallet?.name ?? 'Carteira'}</span>
        </button>
      </div>

      {apiError && (
        <div className="bg-down/10 border border-down/30 text-down rounded-lg px-4 py-3 text-sm">
          {apiError} — verifique se o servidor está rodando em{' '}
          <code className="font-mono text-xs bg-down/10 px-1.5 py-0.5 rounded">
            http://localhost:3001
          </code>
        </div>
      )}

      <OperationForm onSubmit={handleCreate} />
      <CsvImport walletId={walletId} onSuccess={handleImportSuccess} />
      <AlertsPanel rules={alertRules} onUpdate={refresh} />

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
          <PortfolioDashboard summary={portfolio} walletColor={wallet?.color} />
          <OperationsList operations={operations} onDelete={handleDelete} />
        </>
      )}
    </div>
  );
}
