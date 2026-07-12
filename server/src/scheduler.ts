import cron from 'node-cron';
import { runSnapshotJob, catchUpIfNeeded } from './services/snapshots';

// 18:15 BRT Mon-Fri — captures near-closing prices on the B3
const DAILY_CLOSE_CRON = '15 18 * * 1-5';

// Every hour 10:00-18:00 BRT Mon-Fri (intraday mode, off by default)
const INTRADAY_CRON = '0 10-18 * * 1-5';

export function startScheduler(): void {
  cron.schedule(
    DAILY_CLOSE_CRON,
    () => {
      runSnapshotJob().catch((err) => console.error('[snapshots] Daily job error:', err));
    },
    { timezone: 'America/Sao_Paulo' },
  );

  if (process.env.SNAPSHOT_INTRADAY === 'true') {
    cron.schedule(
      INTRADAY_CRON,
      () => {
        runSnapshotJob().catch((err) => console.error('[snapshots] Intraday job error:', err));
      },
      { timezone: 'America/Sao_Paulo' },
    );
    console.log('[snapshots] Intraday mode enabled (hourly 10h-18h BRT Mon-Fri)');
  }

  catchUpIfNeeded().catch((err) => console.error('[snapshots] Catch-up error:', err));

  console.log('[snapshots] Scheduler started');
}
