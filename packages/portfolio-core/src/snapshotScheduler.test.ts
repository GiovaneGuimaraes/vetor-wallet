import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startSnapshotScheduler } from './snapshotScheduler';

describe('startSnapshotScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the runner on every tick', async () => {
    const runner = vi.fn().mockResolvedValue(undefined);
    const handle = startSnapshotScheduler(1000, runner);

    expect(runner).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(runner).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(runner).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3000);
    expect(runner).toHaveBeenCalledTimes(5);

    handle.stop();
  });

  it('does not crash and keeps ticking when the runner rejects', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error('brapi down'))
      .mockResolvedValue(undefined);

    const handle = startSnapshotScheduler(1000, runner);

    await vi.advanceTimersByTimeAsync(1000);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    // scheduler keeps running after the failed tick
    await vi.advanceTimersByTimeAsync(1000);
    expect(runner).toHaveBeenCalledTimes(2);

    handle.stop();
    consoleErrorSpy.mockRestore();
  });

  it('stop cancels further ticks', async () => {
    const runner = vi.fn().mockResolvedValue(undefined);
    const handle = startSnapshotScheduler(1000, runner);

    await vi.advanceTimersByTimeAsync(1000);
    expect(runner).toHaveBeenCalledTimes(1);

    handle.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('stop is safe to call more than once', () => {
    const runner = vi.fn().mockResolvedValue(undefined);
    const handle = startSnapshotScheduler(1000, runner);

    expect(() => {
      handle.stop();
      handle.stop();
    }).not.toThrow();
  });
});
