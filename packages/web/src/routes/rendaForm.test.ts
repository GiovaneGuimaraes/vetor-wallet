import { describe, it, expect } from 'vitest';
import {
  buildIncomeFormPayload,
  initialIncomeFormState,
  resetIncomeFormFields,
  switchIncomeFormKind,
  validateIncomeForm,
  type IncomeFormState,
} from './rendaForm';

describe('initialIncomeFormState', () => {
  it('starts as FIXED with empty fields and the given default date', () => {
    expect(initialIncomeFormState('2026-08-01')).toEqual({
      kind: 'FIXED',
      name: '',
      type: 'SALARIO',
      amount: '',
      date: '2026-08-01',
    });
  });
});

describe('switchIncomeFormKind', () => {
  it('changes only the kind, keeping other fields', () => {
    const state: IncomeFormState = {
      kind: 'FIXED',
      name: 'Salário CLT',
      type: 'SALARIO',
      amount: '5000',
      date: '2026-08-01',
    };
    expect(switchIncomeFormKind(state, 'VARIABLE')).toEqual({ ...state, kind: 'VARIABLE' });
  });
});

describe('validateIncomeForm', () => {
  const base: IncomeFormState = {
    kind: 'FIXED',
    name: '',
    type: 'SALARIO',
    amount: '',
    date: '2026-08-01',
  };

  it('requires a name for FIXED', () => {
    expect(validateIncomeForm({ ...base, amount: '100' })).toBe(
      'Informe um nome para a fonte de renda.'
    );
  });

  it('requires a description for VARIABLE', () => {
    expect(validateIncomeForm({ ...base, kind: 'VARIABLE', amount: '100' })).toBe(
      'Informe uma descrição para a renda.'
    );
  });

  it('rejects a missing/invalid amount', () => {
    expect(validateIncomeForm({ ...base, name: 'Salário', amount: '' })).toBe(
      'Informe um valor válido maior que zero.'
    );
    expect(validateIncomeForm({ ...base, name: 'Salário', amount: '0' })).toBe(
      'Informe um valor válido maior que zero.'
    );
    expect(validateIncomeForm({ ...base, name: 'Salário', amount: '-5' })).toBe(
      'Informe um valor válido maior que zero.'
    );
    expect(validateIncomeForm({ ...base, name: 'Salário', amount: 'abc' })).toBe(
      'Informe um valor válido maior que zero.'
    );
  });

  it('accepts comma as decimal separator', () => {
    expect(validateIncomeForm({ ...base, name: 'Salário', amount: '1234,56' })).toBeNull();
  });

  it('requires a valid date for VARIABLE only', () => {
    expect(
      validateIncomeForm({
        ...base,
        kind: 'VARIABLE',
        name: 'Freela',
        amount: '100',
        date: '',
      })
    ).toBe('Informe a data da renda.');
    expect(
      validateIncomeForm({
        ...base,
        kind: 'FIXED',
        name: 'Salário',
        amount: '100',
        date: '',
      })
    ).toBeNull();
  });

  it('is null when everything is valid', () => {
    expect(
      validateIncomeForm({
        kind: 'VARIABLE',
        name: 'Freela de landing page',
        type: 'FREELA',
        amount: '250.50',
        date: '2026-08-10',
      })
    ).toBeNull();
  });
});

describe('resetIncomeFormFields', () => {
  it('clears fields but keeps the current kind', () => {
    const state: IncomeFormState = {
      kind: 'VARIABLE',
      name: 'Freela',
      type: 'FREELA',
      amount: '100',
      date: '2026-08-10',
    };
    expect(resetIncomeFormFields(state, '2026-09-01')).toEqual({
      kind: 'VARIABLE',
      name: '',
      type: 'SALARIO',
      amount: '',
      date: '2026-09-01',
    });
  });
});

describe('buildIncomeFormPayload', () => {
  it('builds a FixedIncomePayload for kind FIXED, trimming and parsing amount', () => {
    const result = buildIncomeFormPayload({
      kind: 'FIXED',
      name: '  Salário CLT  ',
      type: 'SALARIO',
      amount: '5000,90',
      date: '2026-08-01',
    });
    expect(result).toEqual({
      kind: 'FIXED',
      payload: { name: 'Salário CLT', type: 'SALARIO', amount: 5000.9 },
    });
  });

  it('builds a VariableIncomePayload for kind VARIABLE', () => {
    const result = buildIncomeFormPayload({
      kind: 'VARIABLE',
      name: '  Freela de landing page  ',
      type: 'FREELA',
      amount: '250.5',
      date: '2026-08-10',
    });
    expect(result).toEqual({
      kind: 'VARIABLE',
      payload: { description: 'Freela de landing page', amount: 250.5, date: '2026-08-10' },
    });
  });
});
