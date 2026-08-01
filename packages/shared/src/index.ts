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

/**
 * Um dia da série histórica da carteira (T-058a, `GET /api/portfolio/history`).
 * `value` = valor de mercado (quantidade detida × último fechamento conhecido
 * até a data); `invested` = custo de aquisição das posições detidas na data.
 */
export interface PortfolioHistoryPoint {
  date: string; // YYYY-MM-DD
  value: number;
  invested: number;
}

export interface PortfolioHistoryResponse {
  points: PortfolioHistoryPoint[];
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

/** Ponto de uma série histórica de benchmark (`GET /api/benchmarks/history`, T-068). */
export interface BenchmarkSeriesPoint {
  date: string; // YYYY-MM-DD
  /** Índice acumulado (CDI, base 100 no início da série) ou fechamento (Ibovespa). */
  value: number;
}

/**
 * Séries diárias de CDI/Ibovespa para comparar com a evolução da carteira
 * (T-068). `null` por série = indisponível (falha da fonte externa ou sem
 * dado no período) — a UI simplesmente não desenha aquela linha.
 */
export interface BenchmarkHistoryResponse {
  period: { from: string; to: string };
  cdi: BenchmarkSeriesPoint[] | null;
  ibovespa: BenchmarkSeriesPoint[] | null;
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

/**
 * Payload parcial de `PATCH /api/income/:id` (T-031). Todos os campos são
 * opcionais, mas ao menos um deve vir — corpo vazio responde 400. Cada campo
 * informado passa pela mesma validação da criação.
 */
export interface IncomeSourceUpdate {
  name?: string;
  type?: IncomeSourceType;
  amount?: number;
}

/**
 * Lançamento de renda variável (renda avulsa datada: freela pontual, venda,
 * bônus), distinto de `IncomeSource` — que é uma fonte fixa mensal sem data.
 * Ver T-036; é o espelho de `ExpenseEntry` no layer Renda, sem categoria e
 * sem recorrência (fora de escopo).
 */
export interface IncomeEntry {
  id: number;
  user_id: number;
  description: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  created_at: string;
}

export interface NewIncomeEntry {
  description: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * Payload parcial de `PATCH /api/income-entries/:id` (T-036, padrão T-031).
 * Todos os campos opcionais, mas ao menos um deve vir — corpo sem nenhum campo
 * conhecido responde 400. Editar `date` pode mover o lançamento para outro mês.
 */
export interface IncomeEntryUpdate {
  description?: string;
  amount?: number;
  /** YYYY-MM-DD */
  date?: string;
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

/**
 * Payload parcial de `PATCH /api/expenses/:id` (T-031). `category` é gravada
 * na forma canônica normalizada (T-028), igual à criação — enviar `''`
 * limpa a categoria.
 */
export interface FixedExpenseUpdate {
  name?: string;
  category?: string;
  amount?: number;
}

/**
 * Lançamento de despesa variável (gasto datado do dia a dia), distinto de
 * `FixedExpense` — que é um item fixo mensal sem data. Ver T-022.
 */
export interface ExpenseEntry {
  id: number;
  user_id: number;
  description: string;
  category: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  /**
   * Recorrência mensal que gerou este lançamento (T-035), ou `null` se ele foi
   * digitado à mão. Uma ocorrência materializada é um `expense_entries` normal:
   * pode ser editada/excluída individualmente, e excluí-la não a recria.
   */
  recurring_id: number | null;
  created_at: string;
}

export interface NewExpenseEntry {
  description: string;
  category?: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  /**
   * T-035: `true` cria também uma recorrência mensal a partir deste lançamento
   * (que passa a ser a ocorrência do mês de `date`). Não existe POST separado
   * de recorrência — ver `server/src/routes/recurringExpenses.ts`.
   */
  recurring?: boolean;
  /** Dia do mês das próximas ocorrências (1-31). Default: o dia de `date`. */
  dayOfMonth?: number;
}

/**
 * Template de recorrência mensal de despesa variável (T-035). As ocorrências
 * são `ExpenseEntry` com `recurring_id` apontando para cá, materializadas sob
 * demanda quando um mês é consultado.
 */
export interface RecurringExpense {
  id: number;
  user_id: number;
  description: string;
  category: string;
  amount: number;
  /** 1-31; meses curtos usam o último dia (31 → 28/29 em fevereiro). */
  day_of_month: number;
  /** YYYY-MM — primeiro mês elegível; meses anteriores nunca são gerados. */
  start_month: string;
  /** 1 = ativa, 0 = encerrada (não gera mais ocorrências). */
  active: number;
  /** Momento do encerramento, ou `null` enquanto ativa. */
  ended_at: string | null;
  created_at: string;
}

/**
 * Corpo de `PATCH /api/recurring-expenses/:id`. Só `active: false` (encerrar) é
 * aceito — reativar responde 400, editar o template está fora do escopo.
 */
export interface RecurringExpenseUpdate {
  active?: boolean;
}

/**
 * Payload parcial de `PATCH /api/expense-entries/:id` (T-031). Editar `date`
 * pode mover o lançamento para outro mês — a lista mensal do cliente deve
 * remover o item quando a nova data sai do mês exibido.
 */
export interface ExpenseEntryUpdate {
  description?: string;
  category?: string;
  amount?: number;
  /** YYYY-MM-DD */
  date?: string;
}

/**
 * Um item de `GET /api/expense-entries/summary` (T-033): total de
 * lançamentos variáveis (`expense_entries`) de um mês `YYYY-MM`. Meses sem
 * nenhum lançamento não aparecem no array — o cliente é quem preenche os N
 * meses pedidos com 0 quando um mês não vem na resposta (ver
 * `buildMonthlyHistory` em `web/src/routes/expenseMonth.ts`).
 */
export interface ExpenseMonthSummaryItem {
  /** YYYY-MM */
  month: string;
  total: number;
}

export interface ExpenseMonthSummaryResponse {
  /** Ordenado ascendente por mês. Meses sem lançamentos ficam ausentes. */
  months: ExpenseMonthSummaryItem[];
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
  /**
   * Etiqueta que amarra as duas pernas de uma transferência poupança → meta
   * (T-041): o `WITHDRAW` sem vínculo e o `DEPOSIT` vinculado gravados no mesmo
   * batch compartilham este uuid. `null`/ausente = lançamento normal.
   *
   * É **procedência, não invariante**: nada é validado entre as pernas, o PATCH
   * não aceita o campo e cada perna pode ser editada/excluída sozinha.
   */
  transfer_group?: string | null;
}

export interface NewSavingsEntry {
  type: SavingsEntryType;
  amount: number;
  date: string;
  note?: string;
  /** Id da meta a vincular (opcional). Rejeitado para lançamentos `YIELD`. */
  goalId?: number | null;
}

/**
 * Payload parcial de `PATCH /api/savings/:id` (T-031).
 *
 * Semântica do vínculo com meta:
 * - `goalId` ausente → o vínculo atual é preservado.
 * - `goalId: null` → **desvincula** o lançamento.
 * - `goalId: <id>` → revincula (404 se a meta for de outro usuário).
 *
 * A regra "YIELD não pode ser vinculado" (T-024) é avaliada sobre o estado
 * **resultante**: mudar o `type` para `YIELD` num lançamento vinculado responde
 * 400, a menos que o mesmo PATCH desvincule (`goalId: null`) no mesmo request.
 */
export interface SavingsEntryUpdate {
  type?: SavingsEntryType;
  amount?: number;
  /** YYYY-MM-DD */
  date?: string;
  note?: string;
  goalId?: number | null;
}

export interface SavingsSummary {
  balance: number;
  totalDeposits: number;
  totalYield: number;
  totalWithdrawals: number;
}

/**
 * Corpo de `POST /api/savings/transfer-to-goal` (T-041): reserva para uma meta
 * dinheiro que já está na poupança.
 *
 * O server grava um par atômico WITHDRAW (sem vínculo) + DEPOSIT (vinculado à
 * meta) com o mesmo `amount`/`date` e um `transfer_group` comum. O saldo da
 * poupança **não muda** (−X +X): o que cai é o *saldo livre*
 * (`saldo − reservado em metas`), calculado na leitura.
 */
export interface SavingsTransferRequest {
  goalId: number;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  note?: string;
}

/** As duas pernas criadas pela transferência, na ordem em que foram gravadas. */
export interface SavingsTransferResult {
  withdraw: SavingsEntry;
  deposit: SavingsEntry;
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

/**
 * Orçamento mensal por categoria (T-023). Único por `user_id` + `category`
 * (upsert em `POST /api/budgets`) — não tem vínculo com mês: o teto vale para
 * qualquer mês exibido em Despesas, só o gasto comparado é que varia.
 */
export interface CategoryBudget {
  id: number;
  user_id: number;
  category: string;
  amount: number;
  created_at: string;
}

export interface NewCategoryBudget {
  category: string;
  amount: number;
}

/**
 * Billing / assinatura Pix (T-069).
 *
 * ATENÇÃO — neste domínio (e SÓ neste) o dinheiro trafega em **centavos**
 * (`price_cents`, `amount_cents`), inteiro, e não em reais como o resto do app.
 * É a unidade da AbacatePay: manter a mesma representação evita divergência de
 * arredondamento entre o que registramos e o que o provedor cobrou. Formatar em
 * BRL é responsabilidade da UI (dividir por 100 na apresentação).
 */
export type PlanInterval = 'monthly' | 'yearly';

export interface Plan {
  id: number;
  /** Chave estável do plano (`pro_monthly`, `pro_yearly`). */
  code: string;
  name: string;
  description: string;
  /** Em CENTAVOS. */
  price_cents: number;
  interval: PlanInterval;
  active: boolean;
}

/**
 * - `pending`: assinatura criada, aguardando pagamento da cobrança Pix.
 * - `active`: paga e dentro do período (`current_period_end` no futuro).
 * - `expired`: período venceu sem renovação.
 * - `canceled`: cancelada pelo usuário.
 */
export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'canceled';

/** Uma assinatura por usuário (espelha a carteira única, T-050). */
export interface Subscription {
  id: number;
  plan_id: number;
  status: SubscriptionStatus;
  /** SQLite UTC format `'YYYY-MM-DD HH:MM:SS'`, ou null enquanto nunca houve pagamento confirmado. */
  current_period_end: string | null;
  created_at: string;
}

export type PixChargeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED';

export interface PixCharge {
  id: number;
  plan_id: number;
  /** Em CENTAVOS. */
  amount_cents: number;
  status: PixChargeStatus;
  /** Payload Pix copia-e-cola. */
  br_code: string;
  /** QR Code em base64 (data URI). */
  br_code_base64: string;
  /** SQLite UTC format `'YYYY-MM-DD HH:MM:SS'`, ou null se sem expiração conhecida. */
  expires_at: string | null;
  created_at: string;
}

/**
 * Estado de billing do usuário logado. `billingEnabled` reflete a flag do
 * server (`BILLING_ENABLED`): quando false a UI não deve oferecer assinatura,
 * mesmo que existam planos cadastrados.
 */
export interface MySubscriptionResponse {
  billingEnabled: boolean;
  subscription: Subscription | null;
  /** O plano da assinatura acima, já resolvido. */
  plan: Plan | null;
  /** Cobrança PENDING mais recente, se houver — é o QR Code a exibir. */
  pendingCharge: PixCharge | null;
}

export interface CreateSubscriptionResponse {
  subscription: Subscription;
  charge: PixCharge;
}
