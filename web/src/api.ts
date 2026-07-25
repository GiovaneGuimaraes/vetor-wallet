import type { NewOperation, Operation, PortfolioSummary, CsvImportResult, AlertRule, NewAlertRule, BenchmarkData, User, TickersResponse, QuoteSnapshot, Wallet, NewWallet, IncomeSource, NewIncomeSource, IncomeSourceUpdate, IncomeEntry, NewIncomeEntry, IncomeEntryUpdate, FixedExpense, NewFixedExpense, FixedExpenseUpdate, ExpenseEntry, NewExpenseEntry, ExpenseEntryUpdate, ExpenseMonthSummaryResponse, RecurringExpense, SavingsEntry, NewSavingsEntry, SavingsEntryUpdate, SavingsSummary, SavingsTransferRequest, SavingsTransferResult, Goal, NewGoal, GoalUpdate, CategoryBudget, NewCategoryBudget } from '@vetor-wallet/shared';

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

/** Edição parcial (T-031): só os campos informados são alterados. */
export async function updateIncomeSource(
  id: number,
  update: IncomeSourceUpdate,
): Promise<IncomeSource> {
  const res = await apiFetch(`/api/income/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao atualizar fonte de renda');
  }
  return res.json();
}

export async function deleteIncomeSource(id: number): Promise<void> {
  const res = await apiFetch(`/api/income/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover fonte de renda');
}

// ── Lançamentos de renda variável ─────────────────────────────────────────────

/**
 * Lista as rendas variáveis de um mês (`YYYY-MM`) — T-036. Sem `month`, o
 * server usa o mês corrente e devolve qual mês respondeu.
 */
export async function getIncomeEntries(
  month?: string,
): Promise<{ month: string; entries: IncomeEntry[] }> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  const res = await apiFetch(`/api/income-entries${qs}`);
  if (!res.ok) throw new Error('Falha ao buscar rendas do mês');
  return res.json();
}

export async function createIncomeEntry(entry: NewIncomeEntry): Promise<IncomeEntry> {
  const res = await apiFetch('/api/income-entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao criar renda do mês');
  }
  return res.json();
}

/**
 * Edição parcial (padrão T-031). Editar `date` pode mover o lançamento para
 * outro mês — quem exibe a lista mensal deve tirar o item da lista.
 */
export async function updateIncomeEntry(
  id: number,
  update: IncomeEntryUpdate,
): Promise<IncomeEntry> {
  const res = await apiFetch(`/api/income-entries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao atualizar renda do mês');
  }
  return res.json();
}

export async function deleteIncomeEntry(id: number): Promise<void> {
  const res = await apiFetch(`/api/income-entries/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover renda do mês');
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

/** Edição parcial (T-031). `category` volta normalizada pelo server (T-028). */
export async function updateFixedExpense(
  id: number,
  update: FixedExpenseUpdate,
): Promise<FixedExpense> {
  const res = await apiFetch(`/api/expenses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao atualizar despesa fixa');
  }
  return res.json();
}

export async function deleteFixedExpense(id: number): Promise<void> {
  const res = await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover despesa fixa');
}

// ── Lançamentos de despesas variáveis ─────────────────────────────────────────

/**
 * Lista os lançamentos variáveis de um mês (`YYYY-MM`). Sem `month`, o server
 * usa o mês corrente e devolve qual mês respondeu.
 */
export async function getExpenseEntries(
  month?: string,
): Promise<{ month: string; entries: ExpenseEntry[] }> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  const res = await apiFetch(`/api/expense-entries${qs}`);
  if (!res.ok) throw new Error('Falha ao buscar lançamentos de despesas');
  return res.json();
}

export async function createExpenseEntry(entry: NewExpenseEntry): Promise<ExpenseEntry> {
  const res = await apiFetch('/api/expense-entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao criar lançamento de despesa');
  }
  return res.json();
}

/**
 * Edição parcial (T-031). Editar `date` pode mover o lançamento para outro mês
 * — quem exibe a lista mensal deve tirar o item quando a nova data sai do mês.
 */
export async function updateExpenseEntry(
  id: number,
  update: ExpenseEntryUpdate,
): Promise<ExpenseEntry> {
  const res = await apiFetch(`/api/expense-entries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao atualizar lançamento de despesa');
  }
  return res.json();
}

export async function deleteExpenseEntry(id: number): Promise<void> {
  const res = await apiFetch(`/api/expense-entries/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover lançamento de despesa');
}

/**
 * Histórico mensal (T-033): total de lançamentos variáveis por mês, dos
 * últimos `months` meses até `endMonth` (default: mês corrente do SERVER;
 * cap 24 meses). Meses sem lançamentos não vêm na resposta — ver
 * `buildMonthlyHistory`. `endMonth` (T-049) deixa o cliente ancorar a janela
 * no PRÓPRIO fuso em vez do fuso do processo do server — ver `DespesasPage`,
 * que envia `currentMonthKey()`.
 */
export async function getExpenseEntriesSummary(
  months?: number,
  endMonth?: string,
): Promise<ExpenseMonthSummaryResponse> {
  const params = new URLSearchParams();
  if (months !== undefined) params.set('months', String(months));
  if (endMonth !== undefined) params.set('endMonth', endMonth);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/expense-entries/summary${qs}`);
  if (!res.ok) throw new Error('Falha ao buscar histórico de despesas');
  return res.json();
}

// ── Recorrências mensais de despesa (T-035) ───────────────────────────────────

/**
 * Lista as recorrências ATIVAS. Encerradas não voltam nesta lista — as
 * ocorrências que elas já geraram continuam como lançamentos normais.
 */
export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  const res = await apiFetch('/api/recurring-expenses');
  if (!res.ok) throw new Error('Falha ao buscar recorrências');
  return res.json();
}

/**
 * Encerra uma recorrência: para de gerar ocorrências futuras, mantendo as já
 * materializadas. Não há criação aqui — uma recorrência nasce em
 * `createExpenseEntry({ recurring: true })`.
 */
export async function endRecurringExpense(id: number): Promise<void> {
  const res = await apiFetch(`/api/recurring-expenses/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao encerrar recorrência');
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

/**
 * Edição parcial (T-031). `goalId` ausente preserva o vínculo com a meta,
 * `null` desvincula e um id revincula. Mudar o tipo para `YIELD` num lançamento
 * vinculado é rejeitado com 400 pelo server (T-024).
 */
export async function updateSavingsEntry(
  id: number,
  update: SavingsEntryUpdate,
): Promise<SavingsEntry> {
  const res = await apiFetch(`/api/savings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao atualizar lançamento de poupança');
  }
  return res.json();
}

/**
 * Transfere para uma meta dinheiro que já está na poupança (T-041). O server
 * grava um par WITHDRAW + DEPOSIT atômico: o saldo não muda, o *saldo livre* cai
 * e o progresso da meta sobe. Responde 400 quando o valor excede o saldo livre.
 */
export async function transferSavingsToGoal(
  transfer: SavingsTransferRequest,
): Promise<SavingsTransferResult> {
  const res = await apiFetch('/api/savings/transfer-to-goal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transfer),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao transferir para a meta');
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

// ── Orçamento por categoria ───────────────────────────────────────────────────

export async function getBudgets(): Promise<CategoryBudget[]> {
  const res = await apiFetch('/api/budgets');
  if (!res.ok) throw new Error('Falha ao buscar orçamentos');
  return res.json();
}

/** Upsert: reenviar a mesma categoria substitui o valor do orçamento. */
export async function upsertBudget(budget: NewCategoryBudget): Promise<CategoryBudget> {
  const res = await apiFetch('/api/budgets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(budget),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error ?? 'Falha ao salvar orçamento');
  }
  return res.json();
}

export async function deleteBudget(id: number): Promise<void> {
  const res = await apiFetch(`/api/budgets/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao remover orçamento');
}
