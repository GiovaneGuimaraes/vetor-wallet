export type OperationType = 'BUY' | 'SELL';

export interface Operation {
  id: number;
  ticker: string;
  type: OperationType;
  quantity: number;
  price: number;
  date: string;
  created_at: string;
  wallet_id?: number | null;
}

export interface NewOperation {
  ticker: string;
  type: OperationType;
  quantity: number;
  price: number;
  date: string;
}

export interface Position {
  ticker: string;
  quantity: number;
  avgPrice: number;
  invested: number;
  currentPrice: number | null;
  currentValue: number | null;
  profitLoss: number | null;
  profitLossPct: number | null;
  allocationPct: number | null;
}

export interface PortfolioSummary {
  positions: Position[];
  totalInvested: number;
  totalCurrentValue: number | null;
  totalProfitLoss: number | null;
  totalProfitLossPct: number | null;
  /**
   * true quando a busca de cotações na brapi.dev falhou (rede/timeout/erro)
   * e por isso as posições ficaram sem `currentPrice`/`currentValue`.
   * Opcional para compatibilidade com clientes/serializações antigas.
   */
  quotesUnavailable?: boolean;
  /**
   * P&L do dia (variação frente ao fechamento anterior), derivado do último
   * `quote_snapshot` de cada ticker anterior a hoje. `null`/ausente quando
   * algum ticker ativo não tem snapshot de fechamento anterior ou quando as
   * cotações atuais não estão disponíveis — nesse caso o cliente deve cair
   * no fallback de P&L total (T-016).
   */
  dayProfitLoss?: number | null;
  /** Percentual correspondente a `dayProfitLoss` sobre o valor de fechamento anterior. */
  dayProfitLossPct?: number | null;
}

export type AlertRuleType = 'PRICE_ABOVE' | 'PRICE_BELOW' | 'CHANGE_PCT' | 'ALLOCATION_PCT';

export interface AlertRule {
  id: number;
  ticker: string;
  type: AlertRuleType;
  threshold: number;
  active: number;
  created_at: string;
  wallet_id?: number | null;
}

export interface NewAlertRule {
  ticker: string;
  type: AlertRuleType;
  threshold: number;
}

export interface CsvRowError {
  line: number;
  raw: string;
  error: string;
}

export interface CsvImportResult {
  imported: number;
  errors: CsvRowError[];
  unknownTickers?: string[];
}

export interface TickerInfo {
  ticker: string;
  name: string;
}

export interface TickersResponse {
  results: TickerInfo[];
  listAvailable: boolean;
}

export interface BenchmarkData {
  period: { from: string; to: string };
  portfolio: number | null;
  cdi: number | null;
  ibovespa: number | null;
}

export interface User {
  id: number;
  email: string;
  created_at: string;
  roles: string[];
}

export interface QuoteSnapshot {
  id: number;
  ticker: string;
  price: number;
  captured_at: string;
}

export interface HourlyQuoteInsight {
  id: number;
  ticker: string;
  quote_date: string;   // YYYY-MM-DD, the trading day this hour belongs to
  hour: number;          // 0-23, BRT hour
  price: number;
  captured_at: string;
}

export interface Wallet {
  id: number;
  user_id: number;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

export interface NewWallet {
  name: string;
  description?: string;
  color?: string;
}

export type IncomeSourceType = 'SALARIO' | 'FREELA' | 'OUTRO';

export interface IncomeSource {
  id: number;
  user_id: number;
  name: string;
  type: IncomeSourceType;
  amount: number;
  created_at: string;
}

export interface NewIncomeSource {
  name: string;
  type?: IncomeSourceType;
  amount: number;
}

export interface FixedExpense {
  id: number;
  user_id: number;
  name: string;
  category: string;
  amount: number;
  created_at: string;
}

export interface NewFixedExpense {
  name: string;
  category?: string;
  amount: number;
}

export type SavingsEntryType = 'DEPOSIT' | 'WITHDRAW' | 'YIELD';

export interface SavingsEntry {
  id: number;
  user_id: number;
  type: SavingsEntryType;
  amount: number;
  date: string;
  note: string;
  created_at: string;
  /**
   * Meta financeira à qual o aporte/retirada está vinculado (T-024).
   * `null`/ausente = lançamento sem vínculo. Apenas `DEPOSIT` e `WITHDRAW`
   * podem ser vinculados — `YIELD` fica fora do progresso de metas.
   */
  goal_id?: number | null;
}

export interface NewSavingsEntry {
  type: SavingsEntryType;
  amount: number;
  date: string;
  note?: string;
  /** Id da meta a vincular (opcional). Rejeitado para lançamentos `YIELD`. */
  goalId?: number | null;
}

export interface SavingsSummary {
  balance: number;
  totalDeposits: number;
  totalYield: number;
  totalWithdrawals: number;
}

/**
 * Origem do progresso de uma meta (T-024):
 * - `MANUAL`: `current_amount` é o valor gravado na tabela `goals`, editável
 *   via `PATCH /api/goals/:id`.
 * - `LINKED_SAVINGS`: a meta tem lançamentos de poupança vinculados, então
 *   `current_amount` é **derivado** (DEPOSIT − WITHDRAW vinculados) e o PATCH
 *   de `current_amount` é rejeitado com 400.
 */
export type GoalProgressSource = 'MANUAL' | 'LINKED_SAVINGS';

export interface Goal {
  id: number;
  user_id: number;
  name: string;
  target_amount: number;
  /** Manual ou derivado dos lançamentos vinculados — ver `progress_source`. */
  current_amount: number;
  created_at: string;
  /** Opcional para compatibilidade com serializações antigas. */
  progress_source?: GoalProgressSource;
  /** Quantidade de lançamentos de poupança vinculados a esta meta. */
  linked_entries_count?: number;
}

export interface NewGoal {
  name: string;
  target_amount: number;
  current_amount?: number;
}

export interface GoalUpdate {
  name?: string;
  target_amount?: number;
  current_amount?: number;
}
