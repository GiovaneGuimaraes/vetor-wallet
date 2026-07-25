import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

// `services/recurringExpenses` importa `../db`, que resolve a URL no
// module-eval. Este arquivo só exercita as funções puras de data, mas ainda
// assim aponta para um arquivo temp para não tocar o banco de desenvolvimento.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-recurring-service-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('recurring expenses date helpers (T-035)', () => {
  let daysInMonth: (monthKey: string) => number;
  let occurrenceDate: (monthKey: string, dayOfMonth: number) => string;

  beforeAll(async () => {
    ({ daysInMonth, occurrenceDate } = await import('./recurringExpenses'));
  });

  it('counts days of 31/30-day months', () => {
    expect(daysInMonth('2026-01')).toBe(31);
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  it('counts february in common and leap years', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    // 2000 é bissexto (divisível por 400), 1900 não é (divisível por 100).
    expect(daysInMonth('2000-02')).toBe(29);
    expect(daysInMonth('1900-02')).toBe(28);
  });

  it('returns 0 for malformed month keys', () => {
    expect(daysInMonth('2026-13')).toBe(0);
    expect(daysInMonth('julho')).toBe(0);
  });

  it('keeps the day when the month is long enough', () => {
    expect(occurrenceDate('2026-08', 10)).toBe('2026-08-10');
    expect(occurrenceDate('2026-08', 31)).toBe('2026-08-31');
  });

  it('clamps day 31 to the last day of short months', () => {
    expect(occurrenceDate('2026-02', 31)).toBe('2026-02-28');
    expect(occurrenceDate('2028-02', 31)).toBe('2028-02-29');
    expect(occurrenceDate('2026-04', 31)).toBe('2026-04-30');
    expect(occurrenceDate('2026-11', 31)).toBe('2026-11-30');
  });

  it('clamps days 29 and 30 in february', () => {
    expect(occurrenceDate('2026-02', 29)).toBe('2026-02-28');
    expect(occurrenceDate('2026-02', 30)).toBe('2026-02-28');
    expect(occurrenceDate('2028-02', 29)).toBe('2028-02-29');
    expect(occurrenceDate('2028-02', 30)).toBe('2028-02-29');
  });

  it('never overflows into the next month', () => {
    for (const month of ['2026-01', '2026-02', '2026-04', '2026-06', '2028-02']) {
      for (const day of [1, 15, 28, 29, 30, 31]) {
        expect(occurrenceDate(month, day).slice(0, 7)).toBe(month);
      }
    }
  });

  it('floors the day at 1', () => {
    expect(occurrenceDate('2026-05', 0)).toBe('2026-05-01');
    expect(occurrenceDate('2026-05', -3)).toBe('2026-05-01');
  });

  it('zero-pads single-digit days', () => {
    expect(occurrenceDate('2026-05', 5)).toBe('2026-05-05');
  });
});
