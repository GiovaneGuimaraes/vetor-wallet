import { describe, expect, it } from 'vitest';
import { MonthFetchGuard } from './monthFetch';

describe('MonthFetchGuard (T-049)', () => {
  it('is not in flight before start() is called', () => {
    const guard = new MonthFetchGuard();
    expect(guard.isInFlight('2026-07')).toBe(false);
  });

  it('reports in flight for the same month after start()', () => {
    const guard = new MonthFetchGuard();
    guard.start('2026-07');
    expect(guard.isInFlight('2026-07')).toBe(true);
  });

  it('does not report a different month as in flight', () => {
    const guard = new MonthFetchGuard();
    guard.start('2026-07');
    expect(guard.isInFlight('2026-08')).toBe(false);
  });

  it('clears in-flight state after finish() for the same month', () => {
    const guard = new MonthFetchGuard();
    guard.start('2026-07');
    guard.finish('2026-07');
    expect(guard.isInFlight('2026-07')).toBe(false);
  });

  it('finish() for a stale month does not clear a newer in-flight month', () => {
    const guard = new MonthFetchGuard();
    guard.start('2026-07');
    guard.start('2026-08'); // um mês mais novo assume o "em voo"
    guard.finish('2026-07'); // resolução tardia da chamada antiga
    expect(guard.isInFlight('2026-08')).toBe(true);
  });

  it('allows restarting the same month after it finishes', () => {
    const guard = new MonthFetchGuard();
    guard.start('2026-07');
    guard.finish('2026-07');
    guard.start('2026-07');
    expect(guard.isInFlight('2026-07')).toBe(true);
  });
});
