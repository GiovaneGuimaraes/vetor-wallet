/**
 * In-process scheduler for the daily snapshot catch-up (T-061).
 *
 * Since T-058a, `catchUpIfNeeded()` only ran once, at boot — a server that
 * starts before market close and stays up all day never captures that day's
 * closing prices, because nothing re-triggers the check later. This module
 * re-runs a `runner` (in practice `catchUpIfNeeded`) on a fixed interval so a
 * long-lived process eventually crosses the 18:15 BRT guard on its own,
 * without needing a restart.
 *
 * No new idempotency guard is introduced here: `catchUpIfNeeded` already only
 * acts on a business day, after 18:15 BRT, and only when today has no
 * snapshot yet; `UNIQUE(ticker, date(captured_at))` closes the loop at the DB
 * level. This scheduler is purely "call it again periodically".
 *
 * In-process only: the timer is `.unref()`'d (never holds the event loop
 * open / never delays process exit) and lives only for the lifetime of this
 * process — it is not a cron job, has no persistence, and does not survive a
 * restart or run across multiple instances. A real scheduler (Lambda +
 * EventBridge, OS cron) remains out of scope.
 */

export interface SnapshotSchedulerHandle {
  /** Stops the scheduler — no further ticks will run. Safe to call more than once. */
  stop: () => void;
}

/**
 * Starts a periodic timer that invokes `runner()` every `intervalMs`.
 *
 * - The timer never blocks process exit (`.unref()`).
 * - A rejected/throwing `runner` is caught and logged — it never crashes the
 *   process and never stops subsequent ticks.
 * - Returns a handle whose `stop()` cancels the interval.
 */
export function startSnapshotScheduler(
  intervalMs: number,
  runner: () => Promise<void>,
): SnapshotSchedulerHandle {
  const timer = setInterval(() => {
    Promise.resolve()
      .then(() => runner())
      .catch((err) => {
        console.error('[snapshots] Scheduled catch-up run failed (scheduler continues):', err);
      });
  }, intervalMs);

  timer.unref();

  return {
    stop: () => clearInterval(timer),
  };
}
