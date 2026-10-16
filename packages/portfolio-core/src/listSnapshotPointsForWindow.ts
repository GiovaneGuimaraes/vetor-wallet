import type { Db } from '@vetor-wallet/db';
import type { SnapshotPoint } from './types';

export interface ListSnapshotPointsForWindowParams {
  db: Db;
  /** Os tickers que o usuário já operou — é aqui que o isolamento acontece. */
  tickers: string[];
  /** `YYYY-MM-DD`: primeiro dia da janela (inclusive). */
  windowStart: string;
  /** `YYYY-MM-DD`: último dia da janela (inclusive). */
  endDate: string;
}

/**
 * Os fechamentos que `buildPortfolioHistory` precisa para uma janela — saiu de
 * `GET /api/portfolio/history` na T-104 (fatia 2/2), com as duas queries como
 * eram.
 *
 * Piso de data (T-063): não trafega o histórico inteiro do ticker — só as
 * linhas DENTRO da janela + uma linha de BASE por ticker (o último fechamento
 * conhecido antes dela), que é o que o forward-fill do primeiro dia precisa.
 * Sem o piso, a coleta diária faz `quote_snapshots` crescer sem limite e cada
 * request de histórico voltaria a ler a tabela inteira.
 *
 * A base usa `<` estrito no início da janela, para não duplicar uma linha que a
 * query da janela já trouxe quando ela cai exatamente em `windowStart`. A
 * ordem devolvida é base primeiro, janela depois — `buildPortfolioHistory`
 * reordena por data de qualquer forma.
 *
 * `quote_snapshots` não tem `user_id` (preço é global): sem tickers, nem
 * consulta.
 */
export async function listSnapshotPointsForWindow(
  params: ListSnapshotPointsForWindowParams
): Promise<SnapshotPoint[]> {
  const { db, tickers, windowStart, endDate } = params;
  if (tickers.length === 0) return [];

  const placeholders = tickers.map(() => '?').join(',');

  const snapResult = await db.execute({
    sql: `SELECT ticker, date(captured_at) AS date, price FROM quote_snapshots
          WHERE ticker IN (${placeholders}) AND date(captured_at) >= ? AND date(captured_at) <= ?
          ORDER BY captured_at ASC`,
    args: [...tickers, windowStart, endDate],
  });

  const baseResult = await db.execute({
    sql: `SELECT q.ticker AS ticker, date(q.captured_at) AS date, q.price AS price
          FROM quote_snapshots q
          INNER JOIN (
            SELECT ticker, MAX(date(captured_at)) AS max_date
            FROM quote_snapshots
            WHERE ticker IN (${placeholders}) AND date(captured_at) < ?
            GROUP BY ticker
          ) latest ON latest.ticker = q.ticker AND latest.max_date = date(q.captured_at)`,
    args: [...tickers, windowStart],
  });

  return [...baseResult.rows, ...snapResult.rows].map((row) => ({
    ticker: String(row.ticker),
    date: String(row.date),
    price: Number(row.price),
  }));
}
