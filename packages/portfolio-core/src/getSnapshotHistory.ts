import type { Db } from '@vetor-wallet/db';
import type { QuoteSnapshot } from '@vetor-wallet/shared';

export interface GetSnapshotHistoryParams {
  db: Db;
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
  const { db, ticker, from, to } = params;
  let sql = 'SELECT id, ticker, price, captured_at FROM quote_snapshots WHERE ticker = ?';
  const args: (string | number)[] = [ticker];
  if (from) {
    sql += ' AND date(captured_at) >= ?';
    args.push(from);
  }
  if (to) {
    sql += ' AND date(captured_at) <= ?';
    args.push(to);
  }
  sql += ' ORDER BY captured_at ASC';

  const result = await db.execute({ sql, args });
  return result.rows.map((r) => ({
    id: Number(r.id),
    ticker: r.ticker as string,
    price: Number(r.price),
    captured_at: r.captured_at as string,
  }));
}
