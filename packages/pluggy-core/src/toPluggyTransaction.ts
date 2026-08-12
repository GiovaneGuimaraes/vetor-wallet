/**
 * Transação como o app precisa dela (T-087).
 *
 * Campos confirmados na doc da Pluggy: `id` (UUID), `date` (**timestamp** ISO
 * 8601, não `YYYY-MM-DD`), `description`, `amount` (double, negativo para
 * débito em conta), `type` (`DEBIT`|`CREDIT`), `category`, `currencyCode`,
 * `status` (`POSTED`|`PENDING`). O resto do payload (`balance`, `paymentData`,
 * `creditCardMetadata`, `merchant`, `order`...) é descartado de propósito.
 *
 * `descriptionRaw` entra como fallback de descrição: a `description` é a versão
 * enriquecida e pode vir vazia em conexões sem enriquecimento.
 *
 * Tudo é anulável porque o payload é externo. **Nada é inventado aqui** — uma
 * transação sem `id` sai com `id: null` e é o mapeamento (no `bank-import-core`)
 * que a rejeita; inventar id quebraria o dedupe.
 */
export interface PluggyTransaction {
  id: string | null;
  /** Timestamp ISO 8601 como a Pluggy manda — a conversão para data é do mapper. */
  date: string | null;
  description: string | null;
  descriptionRaw: string | null;
  /** Com sinal, como veio. O valor gravado é o absoluto (T-084). */
  amount: number | null;
  type: string | null;
  category: string | null;
  currencyCode: string | null;
  status: string | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function toPluggyTransaction(raw: unknown): PluggyTransaction {
  const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    id: str(item.id),
    date: str(item.date),
    description: str(item.description),
    descriptionRaw: str(item.descriptionRaw),
    amount: typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : null,
    type: str(item.type),
    category: str(item.category),
    currencyCode: str(item.currencyCode),
    status: str(item.status),
  };
}
