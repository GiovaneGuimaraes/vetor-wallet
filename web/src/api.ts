import type { NewOperation, Operation, PortfolioSummary, CsvImportResult, AlertRule, NewAlertRule, BenchmarkData, User, TickersResponse, QuoteSnapshot, Wallet, NewWallet, IncomeSource, NewIncomeSource, FixedExpense, NewFixedExpense, SavingsEntry, NewSavingsEntry, SavingsSummary, Goal, NewGoal, GoalUpdate } from '@vetor-wallet/shared';

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

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function runInsightsJob(date?: string): Promise<{
  tickersProcessed: number;
  saved: number;
  duplicated: number;
  failed: number;
}> {
  const res = await apiFetch('/api/admin/run-insights-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(date ? { date } : {}),
  });
  if (res.status === 403) throw new Error('Acesso restrito a administradores');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Falha ao executar o job de insights' }));
    throw new Error(err.error ?? 'Falha ao executar o job de insights');
  }
  return res.json();
}

// ── Tickers ───────────────────────────────────────────────────────────────────

export async function searchTickers(query: string): Promise<TickersResponse> {
  const res = await apiFetch(`/api/tickers?search=${encodeURIComponent(query)}`);
  if (!res.ok) return { results: [], listAvailable: false };
  return res.json();
}

// ── Wallets ───────────────────────────────────────────────────────────────────

export async function getWallets(): Promise<Wallet[]> {
  const res = await apiFetch('/api/wallets');
  if (!res.ok) throw new Error('Falha ao buscar carteiras');
  return res.json();
}

export async function createWallet(wallet: NewWallet): Promise<Wallet> {
  const res = await apiFetch('/api/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wallet),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ── Operations ────────────────────────────────────────────────────────────────

export async function getOperations(walletId?: number): Promise<Operation[]> {
  const qs = walletId ? `?walletId=${walletId}` : '';
  const res = await apiFetch(`/api/operations${qs}`);
  if (!res.ok) throw new Error('Falha ao buscar operações');
  return res.json();
}

export async function createOperation(op: NewOperation, walletId?: number): Promise<Operation> {
  const res = await apiFetch('/api/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...op, wallet_id: walletId }),
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

export async function getPortfolio(walletId?: number): Promise<PortfolioSummary> {
  const qs = walletId ? `?walletId=${walletId}` : '';
  const res = await apiFetch(`/api/portfolio${qs}`);
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

export async function getSnapshots(ticker: string, from?: string, to?: string): Promise<QuoteSnapshot[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/snapshots/${encodeURIComponent(ticker)}${qs}`);
  if (!res.ok) throw new Error('Falha ao buscar histórico de cotações');
  return res.json();
}

export async function importCsv(csvText: string, walletId?: number): Promise<CsvImportResult> {
  const qs = walletId ? `?walletId=${walletId}` : '';
  const res = await apiFetch(`/api/import${qs}`, {
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

// ── Renda mensal ──────────────────────────────────────────────────────────────

export async function getIncomeSources(): Promise<IncomeSource[]> {
  const res = await apiFetch('/api/income');
  if (!res.ok) throw new Error('Falha ao buscar fontes de renda');
  return res.json();
}

export async function createIncomeSource(income: NewIncomeSource): Promise<IncomeSource> {
  const res = await apiFetch('/api/income', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(income),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao criar fonte de renda');
  }
  return res.json();
}

export async function deleteIncomeSource(id: number): Promise<void> {
  const res = await apiFetch(`/api/income/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover fonte de renda');
}

// ── Despesas fixas ────────────────────────────────────────────────────────────

export async function getFixedExpenses(): Promise<FixedExpense[]> {
  const res = await apiFetch('/api/expenses');
  if (!res.ok) throw new Error('Falha ao buscar despesas fixas');
  return res.json();
}

export async function createFixedExpense(expense: NewFixedExpense): Promise<FixedExpense> {
  const res = await apiFetch('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expense),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao criar despesa fixa');
  }
  return res.json();
}

export async function deleteFixedExpense(id: number): Promise<void> {
  const res = await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover despesa fixa');
}

// ── Poupança / reserva ────────────────────────────────────────────────────────

export async function getSavings(): Promise<{ entries: SavingsEntry[]; summary: SavingsSummary }> {
  const res = await apiFetch('/api/savings');
  if (!res.ok) throw new Error('Falha ao buscar lançamentos de poupança');
  return res.json();
}

export async function createSavingsEntry(entry: NewSavingsEntry): Promise<SavingsEntry> {
  const res = await apiFetch('/api/savings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao criar lançamento de poupança');
  }
  return res.json();
}

export async function deleteSavingsEntry(id: number): Promise<void> {
  const res = await apiFetch(`/api/savings/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover lançamento de poupança');
}

// ── Metas ─────────────────────────────────────────────────────────────────────

export async function getGoals(): Promise<Goal[]> {
  const res = await apiFetch('/api/goals');
  if (!res.ok) throw new Error('Falha ao buscar metas');
  return res.json();
}

export async function createGoal(goal: NewGoal): Promise<Goal> {
  const res = await apiFetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goal),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao criar meta');
  }
  return res.json();
}

export async function updateGoal(id: number, update: GoalUpdate): Promise<Goal> {
  const res = await apiFetch(`/api/goals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao atualizar meta');
  }
  return res.json();
}

export async function deleteGoal(id: number): Promise<void> {
  const res = await apiFetch(`/api/goals/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover meta');
}
