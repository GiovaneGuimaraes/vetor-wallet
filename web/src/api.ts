import type { NewOperation, Operation, PortfolioSummary } from './types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export async function getOperations(): Promise<Operation[]> {
  const res = await fetch(`${BASE}/api/operations`);
  if (!res.ok) throw new Error('Falha ao buscar operações');
  return res.json();
}

export async function createOperation(op: NewOperation): Promise<Operation> {
  const res = await fetch(`${BASE}/api/operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao criar operação');
  }
  return res.json();
}

export async function deleteOperation(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/operations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover operação');
}

export async function getPortfolio(): Promise<PortfolioSummary> {
  const res = await fetch(`${BASE}/api/portfolio`);
  if (!res.ok) throw new Error('Falha ao buscar carteira');
  return res.json();
}
