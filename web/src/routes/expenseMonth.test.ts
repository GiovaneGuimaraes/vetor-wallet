import { describe, it, expect } from 'vitest';
import type { ExpenseEntry, ExpenseMonthSummaryItem, FixedExpense } from '@vetor-wallet/shared';
import {
  buildMonthlyHistory,
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

describe('buildMonthlyHistory', () => {
  function summaryItem(month: string, total: number): ExpenseMonthSummaryItem {
    return { month, total };
  }

  it('builds N months ending on the current month, oldest first', () => {
    const rows = buildMonthlyHistory(3, '2026-07', [], 0);
    expect(rows.map((r) => r.month)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(rows[rows.length - 1].isCurrent).toBe(true);
    expect(rows.slice(0, -1).every((r) => !r.isCurrent)).toBe(true);
  });

  it('matches a manual calculation with known entries in 3 distinct months', () => {
    const summary = [
      summaryItem('2026-05', 100),
      summaryItem('2026-06', 300),
      summaryItem('2026-07', 234.5),
    ];
    const rows = buildMonthlyHistory(3, '2026-07', summary, 1500);

    expect(rows).toEqual([
      { month: '2026-05', label: 'maio de 2026', fixed: 1500, variable: 100, total: 1600, isCurrent: false },
      { month: '2026-06', label: 'junho de 2026', fixed: 1500, variable: 300, total: 1800, isCurrent: false },
      {
        month: '2026-07',
        label: 'julho de 2026',
        fixed: 1500,
        variable: 234.5,
        total: 1734.5,
        isCurrent: true,
      },
    ]);
  });

  it('fills months missing from the summary with variable = 0', () => {
    const rows = buildMonthlyHistory(3, '2026-07', [summaryItem('2026-07', 50)], 1000);
    expect(rows.find((r) => r.month === '2026-05')).toMatchObject({ variable: 0, total: 1000 });
    expect(rows.find((r) => r.month === '2026-06')).toMatchObject({ variable: 0, total: 1000 });
    expect(rows.find((r) => r.month === '2026-07')).toMatchObject({ variable: 50, total: 1050 });
  });

  it('crosses a year boundary', () => {
    const rows = buildMonthlyHistory(3, '2026-01', [], 0);
    expect(rows.map((r) => r.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('returns a single row when monthsCount is 1', () => {
    const rows = buildMonthlyHistory(1, '2026-07', [summaryItem('2026-07', 42)], 1000);
    expect(rows).toEqual([
      {
        month: '2026-07',
        label: 'julho de 2026',
        fixed: 1000,
        variable: 42,
        total: 1042,
        isCurrent: true,
      },
    ]);
  });

  it('ignores a summary item outside the requested window', () => {
    const summary = [summaryItem('2026-07', 50), summaryItem('2026-01', 999)];
    const rows = buildMonthlyHistory(3, '2026-07', summary, 0);
    expect(rows.map((r) => r.month)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(rows.find((r) => r.month === '2026-07')?.variable).toBe(50);
    // '2026-01' não faz parte da janela de 3 meses — seu valor não deve
    // vazar para nenhuma das linhas montadas.
    expect(rows.every((r) => r.total !== 999)).toBe(true);
  });
});
