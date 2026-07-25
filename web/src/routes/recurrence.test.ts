import { describe, it, expect } from 'vitest';
import type { RecurringExpense } from '@vetor-wallet/shared';
import {
  activeRecurrences,
  formatRecurrenceDay,
  isRecurringOccurrence,
  recurrenceStartMonth,
  startsLaterThanEntry,
  totalRecurring,
} from './recurrence';

function makeRecurrence(overrides: Partial<RecurringExpense> = {}): RecurringExpense {
  return {
    id: 1,
    user_id: 1,
    description: 'Assinatura',
    category: 'streaming',
    amount: 39.9,
    day_of_month: 10,
    start_month: '2026-07',
    active: 1,
    ended_at: null,
    created_at: '2026-07-10 12:00:00',
    ...overrides,
  };
}

describe('formatRecurrenceDay (T-035)', () => {
  it('formats a plain day', () => {
    expect(formatRecurrenceDay(10)).toBe('todo dia 10');
    expect(formatRecurrenceDay(1)).toBe('todo dia 1');
    expect(formatRecurrenceDay(28)).toBe('todo dia 28');
  });

  it('warns about short months for days 29-31', () => {
    for (const day of [29, 30, 31]) {
      expect(formatRecurrenceDay(day)).toBe(
        `todo dia ${day} (ou no último dia, em meses curtos)`,
      );
    }
  });

  it('clamps out-of-range days and survives garbage', () => {
    expect(formatRecurrenceDay(0)).toBe('todo dia 1');
    expect(formatRecurrenceDay(99)).toBe('todo dia 31 (ou no último dia, em meses curtos)');
    expect(formatRecurrenceDay(Number.NaN)).toBe('todo mês');
  });
});

describe('recurrenceStartMonth / startsLaterThanEntry (T-035)', () => {
  it('floors the start at the creation month for a past entry', () => {
    // Espelha a regra do server: nada é gerado em meses já fechados.
    expect(recurrenceStartMonth('2026-03', '2026-07')).toBe('2026-07');
    expect(startsLaterThanEntry('2026-03', '2026-07')).toBe(true);
  });

  it('keeps a future entry month as the start', () => {
    expect(recurrenceStartMonth('2026-11', '2026-07')).toBe('2026-11');
    expect(startsLaterThanEntry('2026-11', '2026-07')).toBe(false);
  });

  it('is the same month when the entry is in the current month', () => {
    expect(recurrenceStartMonth('2026-07', '2026-07')).toBe('2026-07');
    expect(startsLaterThanEntry('2026-07', '2026-07')).toBe(false);
  });

  it('compares across year boundaries', () => {
    expect(recurrenceStartMonth('2025-12', '2026-01')).toBe('2026-01');
    expect(recurrenceStartMonth('2027-01', '2026-12')).toBe('2027-01');
  });
});

describe('isRecurringOccurrence (T-035)', () => {
  it('distinguishes materialized occurrences from manual entries', () => {
    expect(isRecurringOccurrence({ recurring_id: 7 })).toBe(true);
    expect(isRecurringOccurrence({ recurring_id: null })).toBe(false);
  });

  it('treats a missing field as not recurring', () => {
    expect(isRecurringOccurrence({} as { recurring_id: number | null })).toBe(false);
  });
});

describe('activeRecurrences / totalRecurring (T-035)', () => {
  it('drops ended recurrences', () => {
    const list = [
      makeRecurrence({ id: 1 }),
      makeRecurrence({ id: 2, active: 0, ended_at: '2026-08-01 10:00:00' }),
    ];
    expect(activeRecurrences(list).map((r) => r.id)).toEqual([1]);
    expect(totalRecurring(list)).toBe(39.9);
  });

  it('orders by amount desc, then description', () => {
    const list = [
      makeRecurrence({ id: 1, description: 'Barato', amount: 10 }),
      makeRecurrence({ id: 2, description: 'Caro', amount: 500 }),
      makeRecurrence({ id: 3, description: 'Ambíguo', amount: 10 }),
    ];
    expect(activeRecurrences(list).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('sums nothing for an empty list', () => {
    expect(activeRecurrences([])).toEqual([]);
    expect(totalRecurring([])).toBe(0);
  });
});
