import type { PluggyInvestment } from './toPluggyInvestment';

/** O único `type` da Pluggy que esta tradução aceita (T-091d, fatia d2). */
export const PLUGGY_FIXED_INCOME_TYPE = 'FIXED_INCOME';

/** Moeda em que a Renda Fixa do app é somada. */
export const PLUGGY_FIXED_INCOME_CURRENCY = 'BRL';

/**
 * Posição de Renda Fixa **lida ao vivo** da Pluggy, na forma em que a tela de
 * Renda Fixa a exibe (T-091d, fatia d2).
 *
 * É irmã — não cópia — da linha de `fixed_income_positions` (RF manual):
 *
 * - **Tem o `id` da Pluggy, nunca o `itemId`.** Nunca vira linha no banco
 *   (decisão do humano, P1 de 2026-10-21: posição da Pluggy é lida a cada
 *   acesso, como o saldo da T-089e), então não há id NOSSO; o `id` é o do
 *   investimento na Pluggy, e desce porque o vínculo manual↔Pluggy (fatia d3)
 *   precisa dele: a posição manual guarda esse id em
 *   `superseded_by_pluggy_investment_id` e o web casa com esta leitura ao
 *   vivo. Já o `itemId` é credencial portadora e não desce para o cliente.
 * - **Tudo é anulável e nada é inventado**: `currentValue` `null` quer dizer
 *   "a Pluggy não mandou saldo", e quem soma tem de pular — nunca tratar como 0
 *   nem como valor aplicado.
 * - **`kind`/`rateType` NÃO são mapeados para o vocabulário do
 *   `fixed-income-core`** (`FIXED_INCOME_KINDS`/`FIXED_INCOME_RATE_TYPES`). O
 *   enum de `subtype` da Pluggy não é documentado e o significado de `rate`
 *   por `rateType` também não — mapear seria chutar, e chute em taxa é dado
 *   financeiro errado na tela. Os dois saem crus e a UI os mostra como texto.
 */
export interface PluggyFixedIncomePosition {
  /** `id` do investimento na Pluggy (alvo do vínculo da fatia d3). `null` se não veio. */
  id: string | null;
  /** `name` da Pluggy, como veio. */
  name: string | null;
  /** Ex.: `CDB`, `LCI`, `TREASURY` — cru, enum não documentado. */
  subtype: string | null;
  /** Emissor do título; sem ele, a instituição onde a posição está. */
  institution: string | null;
  /** `amountOriginal` — valor aplicado, se vier. */
  investedAmount: number | null;
  /** Saldo atual: `balance`, senão `amount`. `null` = a Pluggy não mandou. */
  currentValue: number | null;
  /** `YYYY-MM-DD` da data de referência do saldo (`date`), se vier. */
  currentValueDate: string | null;
  /** `YYYY-MM-DD` do vencimento (`dueDate`, assumido — ver `CLAUDE.md`). */
  maturityDate: string | null;
  /** Cru, como veio (ex.: `CDI`). Ver nota sobre mapeamento acima. */
  rateType: string | null;
  rate: number | null;
}

/** `2028-01-31T00:00:00.000Z` → `2028-01-31`; qualquer outra coisa → `null`. */
function isoDay(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

/**
 * `PluggyInvestment` → posição de Renda Fixa para exibir, ou `null` quando o
 * investimento **não entra** na Renda Fixa desta fatia:
 *
 * - `type` diferente de `FIXED_INCOME` (inclusive `null`): `EQUITY`,
 *   `MUTUAL_FUND`, `ETF`... ficam para fatias futuras — não é bug, é escopo;
 * - moeda informada e diferente de `BRL`: somar dólar com real no total da
 *   Renda Fixa seria número errado. Moeda **ausente** passa (o Open Finance
 *   brasileiro é em real; descartar por falta do campo sumiria com posição).
 *
 * Função pura, sem I/O: quem lê a Pluggy é `fetchPluggyInvestments`, quem
 * decide não gravar nada é a rota.
 */
export function toPluggyFixedIncomePosition(
  investment: PluggyInvestment
): PluggyFixedIncomePosition | null {
  if (investment.type !== PLUGGY_FIXED_INCOME_TYPE) return null;
  if (
    investment.currencyCode !== null &&
    investment.currencyCode.toUpperCase() !== PLUGGY_FIXED_INCOME_CURRENCY
  ) {
    return null;
  }

  return {
    id: investment.id,
    name: investment.name,
    subtype: investment.subtype,
    institution: investment.issuer ?? investment.institutionName,
    investedAmount: investment.amountOriginal,
    currentValue: investment.balance ?? investment.amount,
    currentValueDate: isoDay(investment.date),
    maturityDate: isoDay(investment.dueDate),
    rateType: investment.rateType,
    rate: investment.rate,
  };
}
