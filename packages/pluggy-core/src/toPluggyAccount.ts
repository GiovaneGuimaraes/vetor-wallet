/**
 * Conta bancária/cartão como o app precisa dela. Campos que a Pluggy documenta
 * mas o app não usa (`bankData`, `creditData`, `owner`, `taxNumber`, `number`...)
 * são deliberadamente descartados: package de Integração traduz o mundo externo
 * no nosso tipo, não repassa o payload inteiro. `balance` voltou a ser trazido
 * na T-089e — até então era descartado de propósito — para o patrimônio total
 * da Home somar o saldo das contas `BANK` da conexão bancária.
 *
 * Tudo é `| null` porque o payload é externo: só o `id` é indispensável, e quem
 * decide o que fazer com um item incompleto é o consumidor, não o parser.
 */
export interface PluggyAccount {
  id: string | null;
  /** `BANK` (conta) ou `CREDIT` (cartão) — muda a convenção de sinal do valor. */
  type: string | null;
  /** `CHECKING_ACCOUNT` | `SAVINGS_ACCOUNT` | `CREDIT_CARD`. */
  subtype: string | null;
  name: string | null;
  currencyCode: string | null;
  /**
   * Saldo da conta, em reais, como veio (T-089e). Em `CREDIT` é o saldo
   * devedor do cartão — nunca patrimônio; quem decide o que somar é o
   * consumidor (`routes/pluggy.ts`, filtra por `type === 'BANK'`).
   * `null` se ausente ou não numérico — nunca inventado.
   */
  balance: number | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toPluggyAccount(raw: unknown): PluggyAccount {
  const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    id: str(item.id),
    type: str(item.type),
    subtype: str(item.subtype),
    name: str(item.name) ?? str(item.marketingName),
    currencyCode: str(item.currencyCode),
    balance: num(item.balance),
  };
}
