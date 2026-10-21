/**
 * Investimento como o app precisa dele (T-091d, fatia d1).
 *
 * Campos vistos no exemplo de resposta de `GET /investments` na doc da Pluggy:
 * `id`, `itemId`, `type`, `subtype`, `status`, `name`, `code`, `currencyCode`,
 * `balance`, `amount`, `amountOriginal`, `quantity`, `value`, `rateType`,
 * `rate`, `fixedAnnualRate`, `date`, `issueDate`. O resto (`owner`, `issuer`,
 * `issuerCNPJ`, `institution`, `transactions`, taxas e rentabilidades...) é
 * descartado de propósito: package de Integração traduz, não repassa.
 *
 * **`type` é preservado como veio** — `FIXED_INCOME`, `EQUITY`, `MUTUAL_FUND`,
 * `ETF`, `COE`, `SECURITY`, `OTHER` ou qualquer valor que a Pluggy invente
 * amanhã. Mapear para o vocabulário do `fixed-income-core` é decisão de quem
 * consome (fatia d2), não deste parser; e tipo desconhecido **nunca** é motivo
 * para descartar o investimento.
 *
 * Tudo é anulável porque o payload é externo. **Nada é inventado**: campo
 * ausente, vazio ou com tipo errado vira `null` — inclusive `id` e `type`.
 */
export interface PluggyInvestment {
  id: string | null;
  itemId: string | null;
  /** Como veio da Pluggy (`FIXED_INCOME`, `EQUITY`...); sem mapeamento aqui. */
  type: string | null;
  /** Ex.: `CDB`, `MULTIMARKET_FUND`, `RETIREMENT` — enum completo não documentado. */
  subtype: string | null;
  /** Ex.: `ACTIVE` — enum completo não documentado. */
  status: string | null;
  name: string | null;
  code: string | null;
  currencyCode: string | null;
  /** Saldo atual da posição, como veio. */
  balance: number | null;
  amount: number | null;
  /** Valor aplicado originalmente, como veio. */
  amountOriginal: number | null;
  quantity: number | null;
  /** Preço/cota unitária, como veio. */
  value: number | null;
  rateType: string | null;
  rate: number | null;
  fixedAnnualRate: number | null;
  /** Timestamp ISO 8601 como a Pluggy manda (data de referência do saldo). */
  date: string | null;
  issueDate: string | null;
  /**
   * Vencimento. **Assumido**: não aparece no exemplo da doc de `/investments`;
   * lido se vier, `null` se não vier. Ver "Contrato da API" no `CLAUDE.md`.
   */
  dueDate: string | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toPluggyInvestment(raw: unknown): PluggyInvestment {
  const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    id: str(item.id),
    itemId: str(item.itemId),
    type: str(item.type),
    subtype: str(item.subtype),
    status: str(item.status),
    name: str(item.name),
    code: str(item.code),
    currencyCode: str(item.currencyCode),
    balance: num(item.balance),
    amount: num(item.amount),
    amountOriginal: num(item.amountOriginal),
    quantity: num(item.quantity),
    value: num(item.value),
    rateType: str(item.rateType),
    rate: num(item.rate),
    fixedAnnualRate: num(item.fixedAnnualRate),
    date: str(item.date),
    issueDate: str(item.issueDate),
    dueDate: str(item.dueDate),
  };
}
