import { describe, it, expect } from 'vitest';
import type { FixedExpense } from '@vetor-wallet/shared';
import { groupByCategory } from './expensesGrouping';

function makeExpense(overrides: Partial<FixedExpense> = {}): FixedExpense {
  return {
    id: 1,
    user_id: 1,
    name: 'Despesa',
    category: '',
    amount: 0,
    created_at: '2026-01-01',
    ...overrides,
  };
}

describe('groupByCategory', () => {
  it('retorna lista vazia para array vazio', () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it('agrupa despesas sem categoria sob "Sem categoria"', () => {
    const result = groupByCategory([
      makeExpense({ id: 1, category: '', amount: 100 }),
      makeExpense({ id: 2, category: '   ', amount: 50 }),
    ]);
    expect(result).toEqual([
      {
        category: 'Sem categoria',
        items: [
          makeExpense({ id: 1, category: '', amount: 100 }),
          makeExpense({ id: 2, category: '   ', amount: 50 }),
        ],
        total: 150,
      },
    ]);
  });

  it('agrupa por categoria, soma o total de cada grupo e ordena alfabeticamente (pt-BR)', () => {
    const result = groupByCategory([
      makeExpense({ id: 1, category: 'Transporte', amount: 200 }),
      makeExpense({ id: 2, category: 'Moradia', amount: 1000 }),
      makeExpense({ id: 3, category: 'Moradia', amount: 300 }),
    ]);

    expect(result.map((g) => g.category)).toEqual(['Moradia', 'Transporte']);
    expect(result.find((g) => g.category === 'Moradia')?.total).toBe(1300);
    expect(result.find((g) => g.category === 'Transporte')?.total).toBe(200);
  });
});
