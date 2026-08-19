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

/**
 * Relatório por transação da importação de extrato OFX (T-085).
 *
 * Diferente do CSV de operações (que reporta `errors` por LINHA e um contador de
 * importadas), o OFX reporta **uma linha por transação** com um `status`, porque
 * a importação tem três desfechos e não dois: além de importada e rejeitada,
 * existe a **duplicada** — a transação já estava no banco pelo `external_id`
 * (T-084) e reimportar o mesmo extrato é o caminho normal de uso, não um erro.
 * Os campos crus vêm opcionais: uma transação rejeitada por DTPOSTED ilegível
 * ainda mostra FITID e valor, o que dá contexto ao usuário na UI (T-086).
 */
export type OfxTransactionStatus = 'imported' | 'duplicated' | 'rejected';

export interface OfxImportTransaction {
  status: OfxTransactionStatus;
  fitid?: string;
  date?: string;
  /** Valor ABSOLUTO; `entryType` carrega o sinal. */
  amount?: number;
  description?: string;
  entryType?: 'income' | 'expense';
  /** Presente só em `rejected`. */
  reason?: string;
  /** `id` da linha em `income_entries`/`expense_entries` (importada ou já existente). */
  entryId?: number;
}

export interface OfxImportResult {
  imported: number;
  duplicated: number;
  rejected: number;
  transactions: OfxImportTransaction[];
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
  name: string | null;
  phone: string | null;
  created_at: string;
  roles: string[];
}

/**
 * Resposta de `POST /api/auth/register` (T-106, identidade no AWS Cognito).
 *
 * Dois desfechos porque o user pool pode estar configurado dos dois jeitos e a
 * decisão de produto ainda está aberta:
 *
 * - `pendingConfirmation: false` (HTTP 201) — o cadastro já saiu confirmado e a
 *   sessão está criada: é o `User` de sempre.
 * - `pendingConfirmation: true` (HTTP 202) — o Cognito enviou um código por
 *   e-mail. **Não há sessão** e o `User` ainda não existe; o próximo passo é
 *   confirmar (`POST /api/auth/confirm`) e depois entrar.
 *
 * O campo é o discriminante de propósito: um `User | { email }` obrigaria o
 * chamador a adivinhar pela ausência de `id`.
 */
export interface RegisterPendingConfirmation {
  pendingConfirmation: true;
  email: string;
}

export type RegisterResult = (User & { pendingConfirmation: false }) | RegisterPendingConfirmation;

export interface QuoteSnapshot {
  id: number;
  ticker: string;
  price: number;
  captured_at: string;
}

export interface HourlyQuoteInsight {
  id: number;
  ticker: string;
  quote_date: string; // YYYY-MM-DD, the trading day this hour belongs to
  hour: number; // 0-23, BRT hour
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
  /**
   * T-084: id da transação no sistema de ORIGEM (`ofx:<FITID>`, `pluggy:<id>`)
   * ou `null` para lançamento digitado à mão. Único por usuário — é o que faz
   * reimportar o mesmo período não duplicar.
   */
  external_id: string | null;
  created_at: string;
}

export interface NewIncomeEntry {
  description: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  /**
   * T-084: id na origem, para importação idempotente. Repetido para o mesmo
   * usuário, o POST responde 409 `{ duplicate: true, entry }` em vez de criar
   * um segundo lançamento. Omitido = lançamento manual (sem dedupe).
   */
  externalId?: string;
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
  /**
   * T-084: id da transação no sistema de ORIGEM (`ofx:<FITID>`, `pluggy:<id>`)
   * ou `null` para lançamento digitado à mão. Único por usuário — é o que faz
   * reimportar o mesmo período não duplicar.
   */
  external_id: string | null;
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
  /**
   * T-084: id na origem, para importação idempotente. Repetido para o mesmo
   * usuário, o POST responde 409 `{ duplicate: true, entry }` em vez de criar um
   * segundo lançamento. Incompatível com `recurring: true` (400) — nenhum
   * importador cria recorrência. Omitido = lançamento manual (sem dedupe).
   */
  externalId?: string;
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
   * Etiqueta que amarrava as duas pernas de uma transferência poupança → meta
   * (T-041). Metas foi removida na T-091b1 e a transferência deixou de existir:
   * o campo sobrevive só como **procedência de dado legado** (nada novo é
   * gravado com ele). `null`/ausente = lançamento normal.
   *
   * Nunca foi invariante: nada é validado entre as pernas, o PATCH não aceita o
   * campo e cada perna sempre pôde ser editada/excluída sozinha.
   */
  transfer_group?: string | null;
}

export interface NewSavingsEntry {
  type: SavingsEntryType;
  amount: number;
  date: string;
  note?: string;
}

/**
 * Payload parcial de `PATCH /api/savings/:id` (T-031).
 *
 * O vínculo com meta saiu na T-091b1 (Metas foi removida do app): campo
 * desconhecido no corpo é ignorado, como no resto da API.
 */
export interface SavingsEntryUpdate {
  type?: SavingsEntryType;
  amount?: number;
  /** YYYY-MM-DD */
  date?: string;
  note?: string;
}

export interface SavingsSummary {
  balance: number;
  totalDeposits: number;
  totalYield: number;
  totalWithdrawals: number;
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

// ── Integração Pluggy no app (T-089b/c) ──────────────────────────────────────

/** Uma conexão bancária do usuário, como a UI a exibe. */
export interface PluggyItemView {
  itemId: string;
  connectorId: number | null;
  connectorName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Estado da integração para o usuário logado.
 *
 * `enabled` reflete o gate `ENVIRONMENT` do server (T-089b) e é a ÚNICA fonte
 * do estado no cliente: o web nunca lê uma cópia da flag em `VITE_*`. Flag
 * duplicada em dois `.env` diverge, e a cópia do cliente é trivialmente
 * burlável — quem bloqueia de verdade é a rota.
 */
export interface PluggyStatusResponse {
  enabled: boolean;
  items: PluggyItemView[];
}

export interface PluggyConnectTokenResponse {
  accessToken: string;
}

/**
 * `append` grava por cima do que existe, deduplicando por `external_id` (T-084).
 * `replace` APAGA todos os lançamentos do usuário — renda, despesa e poupança,
 * manuais inclusive — antes de importar. Ver `wipeUserFinancialEntries`.
 */
export type PluggyImportMode = 'append' | 'replace';

/** Uma linha do relatório de importação, no vocabulário do bank-import-core. */
export interface PluggySyncLine {
  status: 'imported' | 'duplicated' | 'rejected' | 'skipped' | 'internal' | 'previewed';
  transactionId?: string;
  date?: string;
  amount?: number;
  description?: string;
  entryType?: 'income' | 'expense';
  reason?: string;
  entryId?: number;
}

export interface PluggySyncTotalsView {
  imported: number;
  duplicated: number;
  rejected: number;
  skipped: number;
  internal: number;
  previewed: number;
}

/** O que foi apagado no modo `replace`; ausente no `append`. */
export interface PluggyWipeReport {
  incomeEntries: number;
  expenseEntries: number;
  savingsEntries: number;
}

export interface PluggySyncResponse {
  mode: PluggyImportMode;
  dateFrom: string;
  totals: PluggySyncTotalsView;
  /** Falhas por item/conta — a sincronização não aborta, reporta. */
  failures: number;
  /** Mensagens das falhas, para a UI não dizer só "1 falha". */
  errors: string[];
  transactions: PluggySyncLine[];
  wiped?: PluggyWipeReport;
}
