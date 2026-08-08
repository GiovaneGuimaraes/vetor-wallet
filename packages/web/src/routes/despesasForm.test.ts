import { describe, it, expect } from 'vitest';
import {
  buildExpenseFormPayload,
  initialExpenseFormState,
  resetExpenseFormFields,
  switchExpenseFormKind,
  validateExpenseForm,
  type ExpenseFormState,
} from './despesasForm';

describe('initialExpenseFormState', () => {
  it('starts as FIXED with empty fields and the given default date', () => {
    expect(initialExpenseFormState('2026-08-01')).toEqual({
      kind: 'FIXED',
      name: '',
      category: '',
      amount: '',
      date: '2026-08-01',
      recurring: false,
    });
  });
});

describe('switchExpenseFormKind', () => {
  it('changes only the kind, keeping other fields', () => {
    const state: ExpenseFormState = {
      kind: 'FIXED',
      name: 'Aluguel',
      category: 'Moradia',
      amount: '1500',
      date: '2026-08-01',
      recurring: false,
    };
    expect(switchExpenseFormKind(state, 'VARIABLE')).toEqual({ ...state, kind: 'VARIABLE' });
  });
});

describe('validateExpenseForm', () => {
  const base: ExpenseFormState = {
    kind: 'FIXED',
    name: '',
    category: '',
    amount: '',
    date: '2026-08-01',
    recurring: false,
  };

  it('requires a name for FIXED', () => {
    expect(validateExpenseForm({ ...base, amount: '100' })).toBe('Informe um nome para a despesa.');
  });

  it('requires a description for VARIABLE', () => {
    expect(validateExpenseForm({ ...base, kind: 'VARIABLE', amount: '100' })).toBe(
      'Informe uma descrição para o lançamento.'
    );
  });

  it('rejects a missing/invalid amount', () => {
    expect(validateExpenseForm({ ...base, name: 'Aluguel', amount: '' })).toBe(
      'Informe um valor válido maior que zero.'
    );
    expect(validateExpenseForm({ ...base, name: 'Aluguel', amount: '0' })).toBe(
      'Informe um valor válido maior que zero.'
    );
    expect(validateExpenseForm({ ...base, name: 'Aluguel', amount: '-5' })).toBe(
      'Informe um valor válido maior que zero.'
    );
    expect(validateExpenseForm({ ...base, name: 'Aluguel', amount: 'abc' })).toBe(
      'Informe um valor válido maior que zero.'
    );
  });

  it('accepts comma as decimal separator', () => {
    expect(validateExpenseForm({ ...base, name: 'Aluguel', amount: '1234,56' })).toBeNull();
  });

  it('requires a valid date for VARIABLE only', () => {
    expect(
      validateExpenseForm({
        ...base,
        kind: 'VARIABLE',
        name: 'Mercado',
        amount: '100',
        date: '',
      })
    ).toBe('Informe a data do lançamento.');
    expect(
      validateExpenseForm({
        ...base,
        kind: 'FIXED',
        name: 'Aluguel',
        amount: '100',
        date: '',
      })
    ).toBeNull();
  });

  it('is null when everything is valid', () => {
    expect(
      validateExpenseForm({
        kind: 'VARIABLE',
        name: 'Mercado',
        category: 'Alimentação',
        amount: '250.50',
        date: '2026-08-10',
        recurring: true,
      })
    ).toBeNull();
  });
});

describe('resetExpenseFormFields', () => {
  it('clears fields but keeps the current kind', () => {
    const state: ExpenseFormState = {
      kind: 'VARIABLE',
      name: 'Mercado',
      category: 'Alimentação',
      amount: '100',
      date: '2026-08-10',
      recurring: true,
    };
    expect(resetExpenseFormFields(state, '2026-09-01')).toEqual({
      kind: 'VARIABLE',
      name: '',
      category: '',
      amount: '',
      date: '2026-09-01',
      recurring: false,
    });
  });
});

describe('buildExpenseFormPayload', () => {
  it('builds a FixedExpensePayload for kind FIXED, trimming and parsing amount', () => {
    const result = buildExpenseFormPayload({
      kind: 'FIXED',
      name: '  Aluguel  ',
      category: '  Moradia  ',
      amount: '1500,90',
      date: '2026-08-01',
      recurring: false,
    });
    expect(result).toEqual({
      kind: 'FIXED',
      payload: { name: 'Aluguel', category: 'Moradia', amount: 1500.9 },
    });
  });

  it('builds a VariableExpensePayload for kind VARIABLE without recurring', () => {
    const result = buildExpenseFormPayload({
      kind: 'VARIABLE',
      name: '  Mercado  ',
      category: '  Alimentação  ',
      amount: '250.5',
      date: '2026-08-10',
      recurring: false,
    });
    expect(result).toEqual({
      kind: 'VARIABLE',
      payload: {
        description: 'Mercado',
        category: 'Alimentação',
        amount: 250.5,
        date: '2026-08-10',
      },
    });
  });

  it('adds recurring: true only when checked', () => {
    const result = buildExpenseFormPayload({
      kind: 'VARIABLE',
      name: 'Netflix',
      category: 'Assinaturas',
      amount: '39.9',
      date: '2026-08-05',
      recurring: true,
    });
    expect(result).toEqual({
      kind: 'VARIABLE',
      payload: {
        description: 'Netflix',
        category: 'Assinaturas',
        amount: 39.9,
        date: '2026-08-05',
        recurring: true,
      },
    });
  });
});
