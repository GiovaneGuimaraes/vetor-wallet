import { describe, it, expect } from 'vitest';
import type { CategoryBudget, ExpenseEntry, FixedExpense } from '@vetor-wallet/shared';
import { computeBudgetProgress, formatBudgetPct } from './budgetProgress';

function budget(category: string, amount: number, id = 1): CategoryBudget {
  return { id, user_id: 1, category, amount, created_at: '2026-07-01 00:00:00' };
}

function fixed(category: string, amount: number, id = 1): FixedExpense {
  return { id, user_id: 1, name: `Fixa ${id}`, category, amount, created_at: '2026-07-01 00:00:00' };
}

function entry(category: string, amount: number, date: string, id = 1): ExpenseEntry {
  return {
    id,
    user_id: 1,
    description: `Gasto ${id}`,
    category,
    amount,
    date,
    created_at: '2026-07-01 00:00:00',
  };
}

describe('computeBudgetProgress', () => {
  it('computes 70% when R$ 500 budget has R$ 350 in known variable entries', () => {
    const [progress] = computeBudgetProgress(
      [budget('mercado', 500)],
      [],
      [entry('mercado', 350, '2026-07-10')],
    );
    expect(progress.spent).toBe(350);
    expect(progress.pct).toBe(70);
    expect(progress.pctClamped).toBe(70);
    expect(progress.over).toBe(false);
  });

  it('sums fixed expenses of the same category into the spent amount', () => {
    const [progress] = computeBudgetProgress(
      [budget('moradia', 1000)],
      [fixed('moradia', 800)],
      [entry('moradia', 100, '2026-07-05')],
    );
    expect(progress.spent).toBe(900);
    expect(progress.pct).toBe(90);
  });

  it('flags over 100% visually but keeps the real percentage in pct', () => {
    const [progress] = computeBudgetProgress(
      [budget('lazer', 200)],
      [],
      [entry('lazer', 280, '2026-07-01')],
    );
    expect(progress.pct).toBe(140);
    expect(progress.pctClamped).toBe(100);
    expect(progress.over).toBe(true);
  });

  it('flags over exactly at 100%', () => {
    const [progress] = computeBudgetProgress([budget('saude', 300)], [], [entry('saude', 300, '2026-07-01')]);
    expect(progress.pct).toBe(100);
    expect(progress.over).toBe(true);
  });

  it('ignores entries/fixed expenses of other categories', () => {
    const [progress] = computeBudgetProgress(
      [budget('mercado', 500)],
      [fixed('moradia', 800)],
      [entry('transporte', 100, '2026-07-05'), entry('mercado', 50, '2026-07-06')],
    );
    expect(progress.spent).toBe(50);
    expect(progress.pct).toBe(10);
  });

  it('returns 0% when there is no spending yet', () => {
    const [progress] = computeBudgetProgress([budget('viagem', 1000)], [], []);
    expect(progress.spent).toBe(0);
    expect(progress.pct).toBe(0);
    expect(progress.over).toBe(false);
  });

  it('maps one entry per budget, preserving id/category/amount', () => {
    const result = computeBudgetProgress(
      [budget('mercado', 500, 1), budget('lazer', 200, 2)],
      [],
      [entry('mercado', 100, '2026-07-01'), entry('lazer', 50, '2026-07-02')],
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, category: 'Mercado', amount: 500, spent: 100 });
    expect(result[1]).toMatchObject({ id: 2, category: 'Lazer', amount: 200, spent: 50 });
  });

  it('soma gastos com variação de caixa/espaço na mesma categoria do orçamento (T-028)', () => {
    const [progress] = computeBudgetProgress(
      [budget('Mercado', 500)],
      [fixed('mercado ', 100, 1)],
      [
        entry('MERCADO', 150, '2026-07-05', 1),
        entry('  mercado', 100, '2026-07-06', 2),
        entry('mercado', 50, '2026-07-07', 3),
      ],
    );
    expect(progress.spent).toBe(400);
    expect(progress.pct).toBe(80);
    expect(progress.category).toBe('Mercado');
  });

  it('ainda separa categorias realmente diferentes após a normalização (T-028)', () => {
    const [progress] = computeBudgetProgress(
      [budget('Mercado', 500)],
      [],
      [entry('mercadinho', 300, '2026-07-05')],
    );
    expect(progress.spent).toBe(0);
  });
});

describe('formatBudgetPct', () => {
  it('trunca em vez de arredondar — 99.6 vira 99, não 100 (T-030)', () => {
    expect(formatBudgetPct(99.6)).toBe(99);
  });

  it('não sobe para 100 antes de pct realmente atingir 100', () => {
    expect(formatBudgetPct(99.99)).toBe(99);
    expect(formatBudgetPct(100)).toBe(100);
  });

  it('trunca a parte fracionária normalmente em outros valores', () => {
    expect(formatBudgetPct(70.9)).toBe(70);
    expect(formatBudgetPct(140.4)).toBe(140);
  });

  it('mantém 0 para 0%', () => {
    expect(formatBudgetPct(0)).toBe(0);
  });
});
