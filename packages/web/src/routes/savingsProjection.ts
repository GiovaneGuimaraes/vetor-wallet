import type { SavingsEntry } from '@vetor-wallet/shared';
import { currentMonthKey } from './expenseMonth';

/**
 * Simulador de previsão de rendimento da poupança/reserva (T-040).
 *
 * Tudo aqui é puro e roda 100% no cliente — não há endpoint de projeção no
 * server (fora de escopo), e a simulação não é persistida. As funções vivem
 * fora do componente para poderem ser testadas sem DOM (política de testes do
 * CLAUDE.md).
 *
 * Escopo do cálculo: juros compostos mensais sobre um valor inicial, mais um
 * **aporte mensal recorrente opcional** (T-062):
 *
 * ```
 * VF = VP × (1 + i)^n + A × ((1 + i)^n − 1) / i        (i ≠ 0)
 * VF = VP + A × n                                      (i = 0)
 * ```
 *
 * **Convenção do aporte: anuidade ordinária** (aporte no FIM de cada mês) — o
 * aporte do mês m rende a partir do mês m+1, então o aporte do último mês não
 * rende nada. É a convenção mais conservadora das duas e a que corresponde ao
 * comportamento real de quem aporta com a sobra do mês, depois de fechar o
 * orçamento. A alternativa (anuidade antecipada, aporte no início do mês)
 * multiplicaria o termo do aporte por `(1 + i)` e produziria um valor futuro
 * maior — não é o que este simulador promete.
 *
 * **Semântica do rendimento**: `totalYield = VF − VP − A × n`. Os aportes
 * **não** são rendimento — sem essa subtração o número exibido embutiria o
 * dinheiro que o próprio usuário colocou e pareceria errado.
 */

/** Resultado da projeção, já arredondado em centavos. */
export interface SavingsProjection {
  /** Valor futuro ao final do prazo (valor inicial + aportes + rendimento). */
  futureValue: number;
  /**
   * Rendimento acumulado no período — `futureValue − valor inicial − aportes`.
   * Os aportes do usuário NÃO contam como rendimento (T-062).
   */
  totalYield: number;
  /**
   * Total aportado no período (`aporte mensal × meses`), para a UI conseguir
   * explicar de onde vem a diferença entre valor inicial e valor futuro.
   * `0` quando não há aporte mensal.
   */
  totalContributed: number;
}

/** Arredondamento em centavos, mesmo padrão dos valores monetários do app. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Projeta o valor futuro de um saldo por juros compostos mensais, com aporte
 * mensal recorrente opcional (T-062).
 *
 * @param initial valor inicial em reais (aceita 0 — saldo zerado é simulação válida)
 * @param monthlyRatePct taxa mensal em **pontos percentuais** (0,9 = 0,9 %/mês; aceita 0)
 * @param months prazo em meses, inteiro ≥ 0 (0 = nenhum rendimento)
 * @param monthlyContribution aporte mensal em reais, ≥ 0. Default `0` — omitir
 *   reproduz exatamente o comportamento pré-T-062 (`VF = VP × (1 + i)^n`).
 *   Aporte no **fim** de cada mês (anuidade ordinária — ver doc-header).
 *
 * Devolve `null` — em vez de `NaN`/lixo na tela — para toda entrada que não
 * descreve uma simulação possível: valor não finito (`NaN`, `Infinity`),
 * negativo em qualquer um dos quatro argumentos, `months` não inteiro, ou
 * resultado que estoura o alcance de `number` (taxa e prazo altíssimos).
 *
 * Os três números devolvidos são arredondados em centavos sem divergência
 * entre si:
 * `round((inicial + totalContributed + totalYield) * 100) === round(futureValue * 100)`
 * (a igualdade estrita em float não vale para valores grandes).
 *
 * Curto-circuito: `initial === 0` **e** `monthlyContribution === 0` devolve
 * zeros direto, sem passar pela potência — `0 × (1 + i)^n` já é 0
 * matematicamente, mas com taxa e/ou prazo extremos `Math.pow` pode estourar
 * para `Infinity` antes de multiplicar por 0, e `0 × Infinity = NaN` faria a
 * simulação devolver `null` para uma entrada perfeitamente válida (saldo
 * zerado). Com aporte > 0 o curto-circuito **deixa de valer** (T-062): a
 * simulação "parto do zero e aporto X por mês" é legítima e tem valor futuro
 * positivo, então ela segue pelo caminho normal do cálculo.
 */
export function projectSavings(
  initial: number,
  monthlyRatePct: number,
  months: number,
  monthlyContribution = 0
): SavingsProjection | null {
  if (!Number.isFinite(initial) || initial < 0) return null;
  if (!Number.isFinite(monthlyRatePct) || monthlyRatePct < 0) return null;
  if (!Number.isInteger(months) || months < 0) return null;
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) return null;

  if (initial === 0 && monthlyContribution === 0) {
    return { futureValue: 0, totalYield: 0, totalContributed: 0 };
  }

  const rate = monthlyRatePct / 100;
  const growth = Math.pow(1 + rate, months);
  if (!Number.isFinite(growth)) return null;

  // `i = 0` é caso especial: a fórmula da anuidade divide por `i` e daria
  // 0/0 = NaN. Sem juros, o valor futuro é só o principal mais os aportes.
  const contributionsFV =
    rate === 0 ? monthlyContribution * months : monthlyContribution * ((growth - 1) / rate);
  const futureValueRaw = initial * growth + contributionsFV;
  if (!Number.isFinite(futureValueRaw)) return null;

  const initialRounded = roundCents(initial);
  const totalContributed = roundCents(monthlyContribution * months);
  const futureValue = roundCents(futureValueRaw);
  return {
    futureValue,
    totalYield: roundCents(futureValue - initialRounded - totalContributed),
    totalContributed,
  };
}

/** Quantos meses com rendimento entram na média de `deriveMonthlyRatePct`. */
export const RATE_SAMPLE_MONTHS = 6;

/**
 * Deriva uma taxa mensal média (em pontos percentuais) a partir do histórico de
 * lançamentos `YIELD` do usuário, para pré-preencher o campo de taxa.
 *
 * Heurística escolhida (simples e explicável na UI):
 *
 * 1. Agrupa os lançamentos `YIELD` por mês (`YYYY-MM` de `date`), **exceto o
 *    mês corrente** — ainda incompleto, seu rendimento parcial (que só cresce
 *    ao longo do mês) achataria a média para baixo comparado aos meses
 *    fechados que efetivamente renderam o mês inteiro.
 * 2. Para cada mês com rendimento, a **base** é o saldo vigente no início
 *    daquele mês — soma de `DEPOSIT + YIELD − WITHDRAW` de todos os
 *    lançamentos com data anterior ao primeiro dia do mês. Usar o saldo
 *    inicial (e não o final) evita que o próprio rendimento do mês, ou um
 *    aporte feito no meio dele, entre no denominador e achate a taxa.
 * 3. A taxa do mês é `rendimento do mês / base`. Meses com base ≤ 0 são
 *    descartados (não há saldo sobre o qual render — a divisão não significa
 *    nada).
 * 4. A taxa devolvida é a **média aritmética simples** das taxas dos até
 *    {@link RATE_SAMPLE_MONTHS} meses elegíveis mais recentes, convertida em
 *    percentual e arredondada em 4 casas.
 *
 * Devolve `null` quando o histórico é insuficiente (nenhum mês elegível) — a
 * UI então deixa o campo de taxa vazio, com placeholder, para o usuário
 * digitar. Não há teto: um histórico atípico pode render uma taxa alta, e
 * mascarar isso silenciosamente seria pior do que exibi-la (o campo é
 * editável).
 */
export function deriveMonthlyRatePct(entries: SavingsEntry[]): number | null {
  const thisMonth = currentMonthKey();
  const yieldByMonth = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== 'YIELD') continue;
    const month = entry.date.slice(0, 7);
    if (month.length !== 7) continue;
    if (month === thisMonth) continue;
    yieldByMonth.set(month, (yieldByMonth.get(month) ?? 0) + entry.amount);
  }
  if (yieldByMonth.size === 0) return null;

  const rates: number[] = [];
  // Mais recente primeiro: a fatia dos N meses sai do começo da lista.
  for (const month of [...yieldByMonth.keys()].sort().reverse()) {
    const base = balanceBefore(entries, `${month}-01`);
    if (base <= 0) continue;
    rates.push((yieldByMonth.get(month) ?? 0) / base);
    if (rates.length === RATE_SAMPLE_MONTHS) break;
  }
  if (rates.length === 0) return null;

  const avg = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  if (!Number.isFinite(avg)) return null;
  return Math.round(avg * 100 * 10000) / 10000;
}

/** Saldo acumulado pelos lançamentos com data estritamente anterior a `isoDate`. */
function balanceBefore(entries: SavingsEntry[], isoDate: string): number {
  let balance = 0;
  for (const entry of entries) {
    if (entry.date >= isoDate) continue;
    balance += entry.type === 'WITHDRAW' ? -entry.amount : entry.amount;
  }
  return balance;
}

/**
 * Converte um número digitado (valor inicial ou taxa) aceitando vírgula
 * decimal, como `parseMoneyInput` de `inlineEdit.ts` — mas admitindo **0**,
 * que ali é rejeitado por ser inválido num lançamento. Numa simulação, saldo
 * inicial 0 e taxa 0 % são entradas legítimas. Devolve `null` para vazio, não
 * numérico, infinito ou negativo.
 */
export function parseNonNegativeInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** Prazo em meses digitado: inteiro ≥ 0. `null` para qualquer outra coisa. */
export function parseMonthsInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Formata um número para preencher os campos do simulador (valor inicial ou
 * taxa derivada) com vírgula decimal — consistente com o que
 * `parseNonNegativeInput` aceita de volta. Sem isso, o default chegava com
 * ponto (`String(number)`), inconsistente com o resto do form em pt-BR e com
 * o que o próprio usuário digitaria.
 *
 * `decimals` é 2 para o valor inicial (dinheiro) e 4 para a taxa derivada
 * (mesma resolução de {@link deriveMonthlyRatePct}, que já teria zeros à
 * direita descartados se arredondada em 2 casas).
 */
export function formatDecimalInput(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/**
 * Estado inicial da área recolhível "ajustar premissas" da previsão de
 * rendimento (T-076): com defaults suficientes (valor inicial = saldo, taxa
 * derivada do histórico, prazo fixo de 12 meses) a projeção já aparece sem
 * interação, então a área de ajuste nasce **recolhida**. Sem taxa derivada
 * (`derivedRatePct === null`) o usuário precisa digitar a taxa manualmente
 * para ver qualquer projeção, então a área nasce **aberta**.
 */
export function shouldOpenProjectionAssumptions(derivedRatePct: number | null): boolean {
  return derivedRatePct === null;
}
