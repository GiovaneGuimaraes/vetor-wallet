import { useEffect, useState, useCallback } from 'react';
import { getOperations, createOperation, deleteOperation, getPortfolio } from './api';
import { OperationForm } from './components/OperationForm';
import { OperationsList } from './components/OperationsList';
import { PortfolioDashboard } from './components/PortfolioDashboard';
import type { NewOperation, Operation, PortfolioSummary } from './types';
import './App.css';

export default function App() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [apiError, setApiError] = useState('');

  const refresh = useCallback(async () => {
    setApiError('');
    try {
      const [ops, port] = await Promise.all([getOperations(), getPortfolio()]);
      setOperations(ops);
      setPortfolio(port);
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
    <div className="app">
      <header className="app-header">
        <h1>Vetor Wallet</h1>
        <span className="subtitle">Carteira B3 pessoal</span>
      </header>

      {apiError && (
        <div className="api-error">
          {apiError} — verifique se o servidor está rodando em <code>http://localhost:3001</code>
        </div>
      )}

      <main className="app-main">
        <OperationForm onSubmit={handleCreate} />

        {loadingData ? (
          <div className="loading">Carregando...</div>
        ) : (
          <>
            <PortfolioDashboard summary={portfolio} />
            <OperationsList operations={operations} onDelete={handleDelete} />
          </>
        )}
      </main>
    </div>
  );
}
