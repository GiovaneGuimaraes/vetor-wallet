import type { Query } from '@vetor-wallet/query';
import type { QuoteSnapshot } from '@vetor-wallet/shared';

export interface GetSnapshotHistoryParams {
  query: Query;
  /** Já normalizado em MAIÚSCULAS pelo chamador. */
  ticker: string;
  /** `YYYY-MM-DD`, inclusive. Ausente = sem piso. */
  from?: string;
  /** `YYYY-MM-DD`, inclusive. Ausente = sem teto. */
  to?: string;
}

/**
 * Fechamentos diários de UM ticker em ordem cronológica — o que alimenta
 * `GET /api/snapshots/:ticker` (card "Preço por ação", T-060). Sem filtro por
 * usuário: `quote_snapshots` não tem dono, preço é global.
 */
export async function getSnapshotHistory(
  params: GetSnapshotHistoryParams
): Promise<QuoteSnapshot[]> {
  const { query, ticker, from, to } = params;
  let text = 'SELECT id, ticker, price, captured_at FROM quote_snapshots WHERE ticker = $1';
  const values: (string | number)[] = [ticker];
  if (from) {
    values.push(from);
    text += ` AND date(captured_at) >= $${values.length}`;
  }
  if (to) {
    values.push(to);
    text += ` AND date(captured_at) <= $${values.length}`;
  }
  text += ' ORDER BY captured_at ASC';

  const result = await query<Record<string, unknown>>({ text, values });
  return result.rows.map((r) => ({
    id: Number(r.id),
    ticker: r.ticker as string,
    price: Number(r.price),
    captured_at: r.captured_at as string,
  }));
}
