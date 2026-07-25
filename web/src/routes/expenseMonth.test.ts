import { describe, it, expect } from 'vitest';
import type { ExpenseEntry, FixedExpense } from '@vetor-wallet/shared';
import {
  computeMonthTotals,
  currentMonthKey,
  formatDayMonth,
  formatMonthLabel,
  shiftMonth,
} from './expenseMonth';

function fixed(amount: number, id = 1): FixedExpense {
  return {
    id,
    user_id: 1,
    name: `Fixa ${id}`,
    category: 'Moradia',
    amount,
    created_at: '2026-07-01 00:00:00',
  };
}

function entry(amount: number, date: string, id = 1): ExpenseEntry {
  return {
    id,
    user_id: 1,
    description: `Gasto ${id}`,
    category: 'Alimentação',
    amount,
    date,
    created_at: '2026-07-01 00:00:00',
  };
}

describe('currentMonthKey', () => {
  it('uses local time and zero-pads the month', () => {
    expect(currentMonthKey(new Date(2026, 0, 31, 23, 59))).toBe('2026-01');
    expect(currentMonthKey(new Date(2026, 6, 1, 0, 0))).toBe('2026-07');
    expect(currentMonthKey(new Date(2026, 11, 31, 21, 0))).toBe('2026-12');
  });
});

describe('shiftMonth', () => {
  it('moves within the same year', () => {
    expect(shiftMonth('2026-07', -1)).toBe('2026-06');
    expect(shiftMonth('2026-07', 1)).toBe('2026-08');
  });

  it('crosses year boundaries in both directions', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-03', -15)).toBe('2024-12');
    expect(shiftMonth('2026-03', 22)).toBe('2028-01');
  });

  it('returns the input unchanged for malformed keys', () => {
    expect(shiftMonth('julho', 1)).toBe('julho');
    expect(shiftMonth('2026-13', 1)).toBe('2026-13');
  });
});

describe('formatMonthLabel', () => {
  it('renders month name in pt-BR', () => {
    expect(formatMonthLabel('2026-07')).toBe('julho de 2026');
    expect(formatMonthLabel('2025-03')).toBe('março de 2025');
  });

  it('falls back to the raw key when malformed', () => {
    expect(formatMonthLabel('2026-00')).toBe('2026-00');
    expect(formatMonthLabel('abc')).toBe('abc');
  });
});

describe('formatDayMonth', () => {
  it('formats YYYY-MM-DD as DD/MM', () => {
    expect(formatDayMonth('2026-07-09')).toBe('09/07');
  });

  it('returns malformed dates unchanged', () => {
    expect(formatDayMonth('09/07/2026')).toBe('09/07/2026');
  });
});

describe('computeMonthTotals', () => {
  it('sums fixed expenses and month entries', () => {
    const totals = computeMonthTotals(
      [fixed(1500, 1), fixed(40, 2)],
      [entry(234.5, '2026-07-10', 1), entry(65.5, '2026-07-12', 2)],
    );
    expect(totals.fixed).toBe(1540);
    expect(totals.variable).toBe(300);
    expect(totals.total).toBe(1840);
  });

  it('total equals fixed when there are no entries in the month', () => {
    const totals = computeMonthTotals([fixed(1500)], []);
    expect(totals).toEqual({ fixed: 1500, variable: 0, total: 1500 });
  });

  it('total equals variable when there are no fixed expenses', () => {
    const totals = computeMonthTotals([], [entry(80, '2026-06-02')]);
    expect(totals).toEqual({ fixed: 0, variable: 80, total: 80 });
  });

  it('is zero with no data at all', () => {
    expect(computeMonthTotals([], [])).toEqual({ fixed: 0, variable: 0, total: 0 });
  });
});
