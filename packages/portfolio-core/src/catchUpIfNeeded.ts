import type { Query } from '@vetor-wallet/query';
import { getBRTDate } from './getBRTDate';
import { isBusinessDay } from './isBusinessDay';
import { runSnapshotJob } from './runSnapshotJob';

export interface CatchUpIfNeededParams {
  query: Query;
}

/**
 * Runs the snapshot job if no snapshots exist for today and it's past 18:15 BRT
 * on a business day. Handles the case where the server was down during market close.
 *
 * É o ÚNICO gatilho da coleta desde a T-109b: `rest-api/src/api/index.ts` chama
 * isto no boot, passando o `query`. As guardas daqui somadas ao
 * UNIQUE(ticker, date(captured_at)) do banco é que tornam seguro chamar a cada boot.
 */
export async function catchUpIfNeeded(params: CatchUpIfNeededParams): Promise<void> {
  const { query } = params;
  const brt = getBRTDate();

  if (!isBusinessDay(brt)) return;

  const brtHour = brt.getUTCHours();
  const brtMinute = brt.getUTCMinutes();
  if (brtHour < 18 || (brtHour === 18 && brtMinute < 15)) return;

  // date(captured_at) in SQLite extracts UTC date from stored datetime('now')
  // (`date(x)` também é cast válido no Postgres).
  const todayUTC = new Date().toISOString().split('T')[0];
  const existing = await query<{ cnt: number | string }>({
    text: `SELECT COUNT(*) as cnt FROM quote_snapshots WHERE date(captured_at) = $1`,
    values: [todayUTC],
  });

  if (Number(existing.rows[0].cnt) === 0) {
    console.log(`[snapshots] Catch-up: no snapshots for ${todayUTC}, running job now`);
    await runSnapshotJob({ query });
  }
}
