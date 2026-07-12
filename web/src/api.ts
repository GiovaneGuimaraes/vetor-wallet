import type { NewOperation, Operation, PortfolioSummary, CsvImportResult, AlertRule, NewAlertRule, BenchmarkData, User } from '@vetor-wallet/shared';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${input}`, { ...init, credentials: 'include' });
  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:unauthorized'));
  }
  return res;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function getMe(): Promise<User | null> {
  const res = await apiFetch('/api/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Falha ao verificar sessão');
  return res.json();
}

export async function login(email: string, password: string): Promise<User> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao entrar');
  }
  return res.json();
}

export async function register(email: string, password: string): Promise<User> {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao registrar');
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

// ── Operations ────────────────────────────────────────────────────────────────

export async function getOperations(): Promise<Operation[]> {
  const res = await apiFetch('/api/operations');
  if (!res.ok) throw new Error('Falha ao buscar operações');
  return res.json();
}

export async function createOperation(op: NewOperation): Promise<Operation> {
  const res = await apiFetch('/api/operations', {
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
  const res = await apiFetch(`/api/operations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover operação');
}

export async function getPortfolio(): Promise<PortfolioSummary> {
  const res = await apiFetch('/api/portfolio');
  if (!res.ok) throw new Error('Falha ao buscar carteira');
  return res.json();
}

export async function getAlertRules(): Promise<AlertRule[]> {
  const res = await apiFetch('/api/alerts');
  if (!res.ok) throw new Error('Falha ao buscar alertas');
  return res.json();
}

export async function createAlertRule(rule: NewAlertRule): Promise<AlertRule> {
  const res = await apiFetch('/api/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao criar alerta');
  }
  return res.json();
}

export async function deleteAlertRule(id: number): Promise<void> {
  const res = await apiFetch(`/api/alerts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover alerta');
}

export async function getBenchmarks(): Promise<BenchmarkData> {
  const res = await apiFetch('/api/benchmarks');
  if (!res.ok) throw new Error('Falha ao buscar benchmarks');
  return res.json();
}

export async function importCsv(csvText: string): Promise<CsvImportResult> {
  const res = await apiFetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: csvText,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao importar CSV');
  }
  return res.json();
}
