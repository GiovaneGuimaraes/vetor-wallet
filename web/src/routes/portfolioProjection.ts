import type { Operation, PortfolioSummary } from '@vetor-wallet/shared';

/**
 * Simulador de projeção de ganhos da carteira de ações (T-056a).
 *
 * Espelha `savingsProjection.ts` (T-040): tudo aqui é puro e roda 100% no
 * cliente — não há endpoint de projeção no server (fora de escopo) e a
 * simulação não é persistida. As funções vivem fora do componente para
 * poderem ser testadas sem DOM (política de testes do CLAUDE.md).
 *
 * Escopo do cálculo: juros compostos mensais sobre um **valor atual único**
 * (o valor de mercado da carteira). Aporte mensal recorrente NÃO entra na
 * projeção (fora de escopo), então a fórmula é sempre
 * `VF = VP × (1 + i)^n`, igual à T-040.
 *
 * **Divergência deliberada da T-040**: lá a taxa era sempre ≥ 0 (rendimento
 * de poupança não é negativo). Aqui a taxa mensal ACEITA valores negativos
 * (faixa `monthlyRatePct > -100`) — uma ação pode cair de valor, e a taxa
 * derivada do histórico (`deriveMonthlyReturnPct`) é negativa sempre que o
 * P&L da carteira é negativo. `totalGain` negativo é um resultado legítimo
 * da simulação (perda projetada), não um erro.
 *
 * `parseNonNegativeInput`/`parseMonthsInput`/`formatDecimalInput` são
 * genéricos e vêm de `savingsProjection.ts` — não duplicados aqui. Só o
 * parser de número com sinal (`parseSignedInput`) é novo, porque a taxa desta
 * simulação pode ser negativa (diferente do valor inicial da poupança).
 *
 * Nota: `parseNonNegativeInput` (valor atual/prazo em input aceitando 0) e
 * `parseMonthsInput`/`formatDecimalInput` de `savingsProjection.ts` são
 * genéricos e reutilizáveis sem alteração — a UI (T-056b) deve importá-los
 * diretamente de lá em vez de duplicá-los aqui.
 */

/** Resultado da projeção, já arredondado em centavos. */
export interface PortfolioProjection {
  /** Valor futuro ao final do prazo (`VP × (1 + i)^n`). */
  futureValue: number;
  /** Ganho (ou perda, se negativo) acumulado no período (`futureValue − valor atual`). */
  totalGain: number;
}

/** Arredondamento em centavos, mesmo padrão dos valores monetários do app. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Projeta o valor futuro do valor de mercado atual da carteira por juros
 * compostos mensais.
 *
 * @param currentValue valor atual da carteira em reais, ≥ 0 (aceita 0)
 * @param monthlyRatePct taxa mensal em **pontos percentuais**. Pode ser
 *   **negativa** (carteira em queda) — faixa válida `> -100` (uma queda de
 *   100%/mês ou mais zeraria/inverteria o valor, o que não faz sentido para
 *   uma taxa composta mensal).
 * @param months prazo em meses, inteiro ≥ 0 (0 = sem variação)
 *
 * Devolve `null` — em vez de `NaN`/lixo na tela — para toda entrada que não
 * descreve uma simulação possível: valor não finito (`NaN`, `Infinity`),
 * `currentValue` negativo, taxa não finita ou `<= -100`, `months` não
 * inteiro ou negativo, ou resultado que estoura o alcance de `number`.
 *
 * `futureValue` e `totalGain` são arredondados em centavos sem divergência
 * entre si: `round((valor atual + totalGain) * 100) === round(futureValue * 100)`
 * (a igualdade estrita em float não vale para valores grandes).
 *
 * Curto-circuito: `currentValue === 0` devolve `{ futureValue: 0, totalGain: 0 }`
 * direto, sem passar pela potência — `0 × (1 + i)^n` já é 0 matematicamente,
 * mas com taxa e/ou prazo extremos `Math.pow` pode estourar para `Infinity`
 * antes de multiplicar por 0, e `0 × Infinity = NaN` faria a simulação
 * devolver `null` para uma entrada perfeitamente válida (carteira zerada).
 */
export function projectPortfolio(
  currentValue: number,
  monthlyRatePct: number,
  months: number,
): PortfolioProjection | null {
  if (!Number.isFinite(currentValue) || currentValue < 0) return null;
  if (!Number.isFinite(monthlyRatePct) || monthlyRatePct <= -100) return null;
  if (!Number.isInteger(months) || months < 0) return null;

  if (currentValue === 0) return { futureValue: 0, totalGain: 0 };

  const rate = monthlyRatePct / 100;
  const futureValueRaw = currentValue * Math.pow(1 + rate, months);
  if (!Number.isFinite(futureValueRaw)) return null;

  const currentValueRounded = roundCents(currentValue);
  const futureValue = roundCents(futureValueRaw);
  return { futureValue, totalGain: roundCents(futureValue - currentValueRounded) };
}

/** Milissegundos médios por mês civil (`365,2425 / 12` — considera anos bissextos). */
const MS_PER_MONTH = (365.2425 / 12) * 24 * 60 * 60 * 1000;

/**
 * `YYYY-MM-DD` → timestamp de meia-noite **local** (não UTC), consistente com
 * o resto do app (`currentMonthKey`/`shiftMonth` em `expenseMonth.ts` também
 * trabalham no fuso local). `NaN` para formato inválido.
 */
function parseLocalDateMs(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(year, monthIndex, day).getTime();
}

/**
 * Deriva o retorno mensal médio **realizado** da carteira, para pré-preencher
 * o campo de taxa do simulador — mesma ideia de `deriveMonthlyRatePct` da
 * poupança (T-040), mas aqui a fonte é o P&L já calculado pelo server
 * (`PortfolioSummary.totalProfitLossPct`), não um histórico de lançamentos.
 *
 * Passos:
 *
 * 1. `null` se a carteira não tem P&L (`totalProfitLossPct == null` —
 *    cotações indisponíveis ou nenhuma posição) ou `totalInvested <= 0` (nada
 *    investido, retorno percentual não tem base).
 * 2. Calcula a **data de compra média ponderada pelo valor investido**
 *    (`Σ(qty × price × data) / Σ(qty × price)` sobre as operações `BUY` —
 *    `SELL` não entra: uma venda não é um novo aporte, e incluí-la anteciparia
 *    artificialmente a data média). Sem nenhuma `BUY`, devolve `null` (não há
 *    como estimar há quanto tempo o dinheiro está investido).
 *
 *    **Limitação conhecida**: `BUY`s de posições **já vendidas por completo**
 *    (giro passado, sem posição atual) continuam entrando na média ponderada —
 *    a heurística não distingue "comprado e ainda em carteira" de "comprado e
 *    zerado depois". Numa carteira com bastante giro histórico, isso puxa a
 *    data média para trás e infla `elapsedMonths`, subestimando a taxa mensal
 *    derivada. Não corrigido nesta tarefa (T-056a/b) — filtrar por posição
 *    ainda aberta exigiria reconstruir o `buildPositionMap` do server no
 *    cliente, fora do escopo do simulador.
 * 3. `elapsedMonths` = tempo entre essa data média e hoje, em meses (base
 *    365,2425/12 dias — mesmo padrão de ano civil médio de outras contas de
 *    calendário do app). Períodos menores que 1 mês devolvem `null`:
 *    anualizar/mensalizar um P&L de poucos dias produziria uma taxa mensal
 *    absurda (um ganho de 2% em 3 dias viraria uma taxa mensal de dezenas de
 *    %).
 * 4. Taxa mensal **geométrica**: `((1 + pct/100)^(1/elapsedMonths) − 1) × 100`,
 *    arredondada em 4 casas — mesma resolução de `deriveMonthlyRatePct`.
 * 5. **Sem teto** (mesmo precedente da T-040): um retorno realizado atípico é
 *    exibido tal como é, e o campo do simulador continua editável.
 */
export function deriveMonthlyReturnPct(
  operations: Operation[],
  summary: Pick<PortfolioSummary, 'totalProfitLossPct' | 'totalInvested'>,
): number | null {
  if (summary.totalProfitLossPct == null) return null;
  if (!Number.isFinite(summary.totalInvested) || summary.totalInvested <= 0) return null;

  let weightedSum = 0;
  let weightTotal = 0;
  for (const op of operations) {
    if (op.type !== 'BUY') continue;
    const dateMs = parseLocalDateMs(op.date);
    if (!Number.isFinite(dateMs)) continue;
    const weight = op.quantity * op.price;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    weightedSum += weight * dateMs;
    weightTotal += weight;
  }
  if (weightTotal <= 0) return null;

  const avgPurchaseMs = weightedSum / weightTotal;
  const elapsedMonths = (Date.now() - avgPurchaseMs) / MS_PER_MONTH;
  if (!Number.isFinite(elapsedMonths) || elapsedMonths < 1) return null;

  const pct = summary.totalProfitLossPct;
  // Guarda explícita ANTES da potência (revisão da T-056a): sem ela, pct
  // exatamente -100 caía sozinho em `0 ** (1/elapsedMonths) = 0` e devolvia
  // -100 "por acidente" da aritmética, enquanto pct < -100 (base negativa,
  // expoente fracionário) já caía na guarda de NaN abaixo — os dois casos são
  // igualmente "perda total ou pior", e um P&L de -100% não define uma taxa
  // mensal composta coerente, então ambos devem devolver `null` pela mesma
  // razão, não por caminhos diferentes do código.
  if (pct <= -100) return null;
  const monthlyRate = (Math.pow(1 + pct / 100, 1 / elapsedMonths) - 1) * 100;
  if (!Number.isFinite(monthlyRate)) return null;
  return Math.round(monthlyRate * 10000) / 10000;
}

/** Resultado de {@link resolveDefaultCurrentValue}. */
export interface DefaultCurrentValue {
  /** Valor a pré-preencher no campo "Valor atual (R$)" do simulador. */
  value: number;
  /**
   * `true` quando `totalCurrentValue` não estava disponível (cotações fora do
   * ar) e o valor devolvido é o fallback `totalInvested` — a UI usa isso para
   * mostrar um hint explicando a origem do default.
   */
  usedFallback: boolean;
}

/**
 * Deriva o valor default do campo "Valor atual (R$)" do simulador (T-056b): o
 * valor de mercado da carteira (`totalCurrentValue`) quando disponível, ou o
 * valor investido (`totalInvested`) como fallback quando as cotações estão
 * indisponíveis (`totalCurrentValue === null`, tipicamente com
 * `quotesUnavailable: true` — mas o fallback vale por `totalCurrentValue` ser
 * `null`, independente do motivo). Sem `summary` (ainda carregando ou falha
 * no `ShellContext`), devolve `{ value: 0, usedFallback: false }` — o card
 * fica oculto nesse caso por não haver posições confirmadas, então este
 * default nunca chega a aparecer na tela.
 */
export function resolveDefaultCurrentValue(
  summary: Pick<PortfolioSummary, 'totalCurrentValue' | 'totalInvested'> | null,
): DefaultCurrentValue {
  if (!summary) return { value: 0, usedFallback: false };
  if (summary.totalCurrentValue !== null) {
    return { value: summary.totalCurrentValue, usedFallback: false };
  }
  return { value: summary.totalInvested, usedFallback: true };
}

/**
 * Converte um número digitado **com sinal** (a taxa desta simulação pode ser
 * negativa — divergência da T-040, ver doc-header do módulo), aceitando
 * vírgula decimal. Devolve `null` para vazio ou não numérico; `Infinity`
 * também é rejeitado (não é uma taxa utilizável). Diferente de
 * `parseNonNegativeInput`, valores negativos são aceitos aqui — a validação
 * de faixa (`> -100`) é responsabilidade de `projectPortfolio`, não do
 * parser.
 */
export function parseSignedInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}
