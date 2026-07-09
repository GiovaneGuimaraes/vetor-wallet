import { useEffect, useState, useCallback } from 'react';
import { getOperations, createOperation, deleteOperation, getPortfolio, getAlertRules } from './api';
import { OperationForm } from './components/OperationForm';
import { OperationsList } from './components/OperationsList';
import { PortfolioDashboard } from './components/PortfolioDashboard';
import { CsvImport } from './components/CsvImport';
import { AlertsPanel } from './components/AlertsPanel';
import { evaluateAlerts, type TriggeredAlert } from './utils/alerts';
import type { NewOperation, Operation, PortfolioSummary, AlertRule } from '@vetor-wallet/shared';

export default function App() {
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
        getOperations(),
        getPortfolio(),
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
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(op: NewOperation) {
    await createOperation(op);
    await refresh();
  }

  async function handleDelete(id: number) {
    await deleteOperation(id);
    await refresh();
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-edge/50 px-6 py-4 md:px-10">
        <div className="max-w-7xl mx-auto flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-accent">Vetor Wallet</h1>
          <span className="text-sm text-dim">Carteira B3 pessoal</span>
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
        <CsvImport onSuccess={refresh} />
        <AlertsPanel rules={alertRules} onUpdate={refresh} />

        {loadingData ? (
          <div className="text-center py-16 text-dim text-sm">Carregando...</div>
        ) : (
          <>
            {triggeredAlerts.length > 0 && (
              <div className="bg-warn/10 border border-warn/40 rounded-xl p-5">
                <p className="text-xs font-semibold text-warn uppercase tracking-wide mb-3">
                  ⚠ {triggeredAlerts.length} alerta{triggeredAlerts.length !== 1 ? 's' : ''} disparado{triggeredAlerts.length !== 1 ? 's' : ''}
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
            <OperationsList operations={operations} onDelete={handleDelete} />
          </>
        )}
      </main>
    </div>
  );
}
