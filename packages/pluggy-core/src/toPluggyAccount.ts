/**
 * Conta bancária/cartão como o app precisa dela. Campos que a Pluggy documenta
 * mas o app não usa (`balance`, `bankData`, `creditData`, `owner`,
 * `taxNumber`...) são deliberadamente descartados: package de Integração traduz
 * o mundo externo no nosso tipo, não repassa o payload inteiro.
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
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function toPluggyAccount(raw: unknown): PluggyAccount {
  const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    id: str(item.id),
    type: str(item.type),
    subtype: str(item.subtype),
    name: str(item.name) ?? str(item.marketingName),
    currencyCode: str(item.currencyCode),
  };
}
