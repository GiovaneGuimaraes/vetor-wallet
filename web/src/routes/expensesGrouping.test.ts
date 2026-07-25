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

  it('agrupa "Mercado", "mercado" e "mercado " na mesma categoria (T-028)', () => {
    const result = groupByCategory([
      makeExpense({ id: 1, category: 'Mercado', amount: 100 }),
      makeExpense({ id: 2, category: 'mercado', amount: 50 }),
      makeExpense({ id: 3, category: 'mercado ', amount: 25 }),
      makeExpense({ id: 4, category: '  MERCADO', amount: 25 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Mercado');
    expect(result[0].total).toBe(200);
    expect(result[0].items).toHaveLength(4);
  });

  it('colapsa espaços internos ao agrupar (T-028)', () => {
    const result = groupByCategory([
      makeExpense({ id: 1, category: 'compras do mes', amount: 10 }),
      makeExpense({ id: 2, category: 'Compras   do   mes', amount: 20 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Compras do mes');
    expect(result[0].total).toBe(30);
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
