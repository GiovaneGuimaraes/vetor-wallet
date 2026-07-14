// Run from workspace root: pnpm --filter vetor-wallet-cli insights:hourly [YYYY-MM-DD]
// Requires DATABASE_URL in cli/.env pointing to the SQLite file (see .env.example).
// TODO: replace initDb + runHourlyInsightsJob with a thin AWS Lambda handler once
//       the Turso migration is done — DATABASE_URL will then hold the Turso URL.

import 'dotenv/config';
import { initDb } from '@vetor-wallet/server/db';
import { runHourlyInsightsJob } from '@vetor-wallet/server/services/hourlyInsights';

async function main(): Promise<void> {
  const targetDate = process.argv[2];
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    console.error(`[cli] Invalid date format: "${targetDate}" — expected YYYY-MM-DD`);
    process.exit(1);
  }

  await initDb();

  console.log(`[cli] Starting hourly insights job${targetDate ? ` for ${targetDate}` : ' (yesterday)'}...`);

  const results = await runHourlyInsightsJob(targetDate);

  if (results.length === 0) {
    console.log('[cli] No active tickers. Done.');
    process.exit(0);
  }

  let totalProcessed = 0;
  let totalSaved = 0;
  let totalDuplicates = 0;
  let failures = 0;

  for (const r of results) {
    if (r.error) {
      failures++;
      console.error(`  [FAIL] ${r.ticker}: ${r.error}`);
    } else {
      totalProcessed += r.processed;
      totalSaved += r.saved;
      totalDuplicates += r.duplicates;
      console.log(`  [OK]   ${r.ticker}: ${r.processed} processed, ${r.saved} saved, ${r.duplicates} duplicate(s)`);
    }
  }

  const succeeded = results.length - failures;
  console.log(
    `\n[cli] Summary — ${results.length} ticker(s): ` +
    `${succeeded} succeeded, ${failures} failed | ` +
    `${totalSaved} saved, ${totalDuplicates} duplicate(s), ${totalProcessed} processed`,
  );

  process.exit(failures === results.length ? 1 : 0);
}

main().catch((err) => {
  console.error('[cli] Fatal error:', err);
  process.exit(1);
});
