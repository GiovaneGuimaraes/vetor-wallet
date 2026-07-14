import { describe, it, expect } from 'vitest';
import { summariseResults } from './admin';
import type { InsightJobResult } from '../services/hourlyInsights';

function makeResult(overrides: Partial<InsightJobResult> = {}): InsightJobResult {
  return { ticker: 'PETR4', processed: 1, saved: 1, duplicates: 0, ...overrides };
}

describe('summariseResults', () => {
  it('returns zeros for an empty results array', () => {
    expect(summariseResults([])).toEqual({
      tickersProcessed: 0,
      saved: 0,
      duplicated: 0,
      failed: 0,
    });
  });

  it('counts tickers without error as processed', () => {
    const results = [makeResult(), makeResult({ ticker: 'VALE3' })];
    expect(summariseResults(results).tickersProcessed).toBe(2);
  });

  it('does not count tickers with error as processed', () => {
    const results = [
      makeResult(),
      makeResult({ ticker: 'FAIL1', processed: 0, saved: 0, error: 'brapi 400' }),
    ];
    expect(summariseResults(results).tickersProcessed).toBe(1);
  });

  it('sums saved across tickers', () => {
    const results = [
      makeResult({ saved: 1 }),
      makeResult({ ticker: 'VALE3', saved: 0, duplicates: 1 }),
    ];
    expect(summariseResults(results)).toMatchObject({ saved: 1, duplicated: 1 });
  });

  it('counts failed tickers', () => {
    const results = [
      makeResult(),
      makeResult({ ticker: 'FAIL1', error: 'timeout' }),
      makeResult({ ticker: 'FAIL2', error: 'brapi 400' }),
    ];
    expect(summariseResults(results).failed).toBe(2);
  });

  it('handles all tickers failing', () => {
    const results = [
      makeResult({ error: 'err', processed: 0, saved: 0 }),
      makeResult({ ticker: 'VALE3', error: 'err', processed: 0, saved: 0 }),
    ];
    expect(summariseResults(results)).toEqual({
      tickersProcessed: 0,
      saved: 0,
      duplicated: 0,
      failed: 2,
    });
  });
});
