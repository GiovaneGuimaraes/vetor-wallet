import { describe, expect, it } from 'vitest';
import type { FixedIncomePosition } from '@vetor-wallet/shared';
import {
  EMPTY_FIXED_INCOME_FORM,
  FIXED_INCOME_KINDS,
  FIXED_INCOME_RATE_TYPES,
  displayValue,
  maturityLabel,
  parseFixedIncomeForm,
  parseNonNegativeAmountInput,
  parsePositiveAmountInput,
  parseRateInput,
  rateLabel,
  sortByMaturity,
  toFormValues,
  totalDisplayValueCents,
  totalInvestedCents,
  type FixedIncomeFormValues,
} from './fixedIncome';

/** Valores inventados: fixture nunca carrega dado real (convenção da raiz). */
function makePosition(overrides: Partial<FixedIncomePosition> = {}): FixedIncomePosition {
  return {
    id: 1,
    user_id: 1,
    name: 'CDB Banco X',
    kind: 'CDB',
    institution: 'Banco X',
    invested_amount: 1000,
    invested_at: '2026-01-10',
    maturity_date: '2027-01-10',
    rate_type: 'CDI',
    rate: 110,
    current_value: null,
    current_value_date: null,
    created_at: '2026-01-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('displayValue', () => {
  it('usa o saldo informado quando presente', () => {
    expect(
      displayValue(makePosition({ current_value: 1200, current_value_date: '2026-06-01' }))
    ).toBe(1200);
  });

  it('cai para o valor aplicado quando não há saldo informado', () => {
    expect(displayValue(makePosition({ current_value: null }))).toBe(1000);
  });

  it('aceita saldo informado zero (não confunde com "ausente")', () => {
    expect(displayValue(makePosition({ current_value: 0, current_value_date: '2026-06-01' }))).toBe(
      0
    );
  });
});

describe('totalDisplayValueCents / totalInvestedCents', () => {
  it('soma em centavos inteiros, sem resíduo de ponto flutuante', () => {
    const positions = [
      makePosition({ id: 1, invested_amount: 10.1, current_value: null }),
      makePosition({ id: 2, invested_amount: 20.2, current_value: 5.05, current_value_date: 'x' }),
    ];
    expect(totalInvestedCents(positions)).toBe(1010 + 2020);
    expect(totalDisplayValueCents(positions)).toBe(1010 + 505);
  });

  it('devolve 0 para lista vazia', () => {
    expect(totalDisplayValueCents([])).toBe(0);
    expect(totalInvestedCents([])).toBe(0);
  });
});

describe('sortByMaturity', () => {
  it('ordena por vencimento mais próximo primeiro', () => {
    const far = makePosition({ id: 1, maturity_date: '2030-01-01' });
    const near = makePosition({ id: 2, maturity_date: '2026-01-01' });
    expect(sortByMaturity([far, near]).map((p) => p.id)).toEqual([2, 1]);
  });

  it('manda posições sem vencimento (liquidez diária) para o final', () => {
    const daily = makePosition({ id: 1, maturity_date: null });
    const dated = makePosition({ id: 2, maturity_date: '2026-01-01' });
    expect(sortByMaturity([daily, dated]).map((p) => p.id)).toEqual([2, 1]);
  });

  it('empate de data mantém ordem estável por id', () => {
    const a = makePosition({ id: 5, maturity_date: '2026-01-01' });
    const b = makePosition({ id: 2, maturity_date: '2026-01-01' });
    expect(sortByMaturity([a, b]).map((p) => p.id)).toEqual([2, 5]);
  });

  it('duas posições sem vencimento ordenam por id', () => {
    const a = makePosition({ id: 9, maturity_date: null });
    const b = makePosition({ id: 3, maturity_date: null });
    expect(sortByMaturity([a, b]).map((p) => p.id)).toEqual([3, 9]);
  });

  it('não muta o array original', () => {
    const list = [makePosition({ id: 2 }), makePosition({ id: 1 })];
    const sorted = sortByMaturity(list);
    expect(sorted).not.toBe(list);
  });
});

describe('maturityLabel', () => {
  it('liquidez diária para maturity_date null', () => {
    expect(maturityLabel(null, '2026-06-01')).toBe('Liquidez diária');
  });

  it('vence hoje quando a data é igual a hoje', () => {
    expect(maturityLabel('2026-06-01', '2026-06-01')).toBe('Vence hoje');
  });

  it('vence em N dias no singular e plural', () => {
    expect(maturityLabel('2026-06-02', '2026-06-01')).toBe('Vence em 1 dia');
    expect(maturityLabel('2026-06-11', '2026-06-01')).toBe('Vence em 10 dias');
  });

  it('vencido há N dias no singular e plural', () => {
    expect(maturityLabel('2026-05-31', '2026-06-01')).toBe('Vencido há 1 dia');
    expect(maturityLabel('2026-05-20', '2026-06-01')).toBe('Vencido há 12 dias');
  });
});

describe('rateLabel', () => {
  it('PRE: "X% a.a."', () => {
    expect(rateLabel('PRE', 12)).toBe('12% a.a.');
  });

  it('CDI: "X% do CDI"', () => {
    expect(rateLabel('CDI', 110)).toBe('110% do CDI');
  });

  it('IPCA: "IPCA + X% a.a."', () => {
    expect(rateLabel('IPCA', 6)).toBe('IPCA + 6% a.a.');
  });

  it('SELIC: "SELIC + X% a.a."', () => {
    expect(rateLabel('SELIC', 1.5)).toBe('SELIC + 1,5% a.a.');
  });

  it('usa vírgula decimal e arredonda em 2 casas', () => {
    expect(rateLabel('PRE', 12.3456)).toBe('12,35% a.a.');
  });
});

describe('parsePositiveAmountInput', () => {
  it.each(['', '  ', 'abc', '0', '-5', 'Infinity'])('rejeita %p', (raw) => {
    expect(parsePositiveAmountInput(raw)).toBeNull();
  });

  it('aceita vírgula decimal', () => {
    expect(parsePositiveAmountInput('1234,56')).toBe(1234.56);
    expect(parsePositiveAmountInput('10,5')).toBe(10.5);
  });
});

describe('parseNonNegativeAmountInput', () => {
  it('aceita zero', () => {
    expect(parseNonNegativeAmountInput('0')).toBe(0);
  });

  it('rejeita negativo e vazio', () => {
    expect(parseNonNegativeAmountInput('-1')).toBeNull();
    expect(parseNonNegativeAmountInput('')).toBeNull();
  });
});

describe('parseRateInput', () => {
  it('aceita negativo e vírgula decimal', () => {
    expect(parseRateInput('-1,5')).toBe(-1.5);
  });

  it('rejeita vazio e não numérico', () => {
    expect(parseRateInput('')).toBeNull();
    expect(parseRateInput('abc')).toBeNull();
  });
});

function validForm(overrides: Partial<FixedIncomeFormValues> = {}): FixedIncomeFormValues {
  return {
    name: 'CDB Banco X',
    kind: 'CDB',
    institution: 'Banco X',
    investedAmount: '1000',
    investedAt: '2026-01-10',
    maturityDate: '2027-01-10',
    rateType: 'CDI',
    rate: '110',
    currentValue: '',
    currentValueDate: '',
    ...overrides,
  };
}

describe('parseFixedIncomeForm', () => {
  it('aceita um formulário válido completo', () => {
    const result = parseFixedIncomeForm(validForm());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({
        name: 'CDB Banco X',
        kind: 'CDB',
        institution: 'Banco X',
        investedAmount: 1000,
        investedAt: '2026-01-10',
        maturityDate: '2027-01-10',
        rateType: 'CDI',
        rate: 110,
        currentValue: null,
        currentValueDate: null,
      });
    }
  });

  it('aceita sem vencimento (liquidez diária)', () => {
    const result = parseFixedIncomeForm(validForm({ maturityDate: '' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.maturityDate).toBeNull();
  });

  it('aceita saldo informado junto da data', () => {
    const result = parseFixedIncomeForm(
      validForm({ currentValue: '1050,5', currentValueDate: '2026-06-01' })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.currentValue).toBe(1050.5);
      expect(result.payload.currentValueDate).toBe('2026-06-01');
    }
  });

  it('rejeita nome vazio', () => {
    expect(parseFixedIncomeForm(validForm({ name: '  ' })).ok).toBe(false);
  });

  it('rejeita kind desconhecido', () => {
    const result = parseFixedIncomeForm(
      validForm({ kind: 'INVALIDO' as FixedIncomeFormValues['kind'] })
    );
    expect(result.ok).toBe(false);
  });

  it('rejeita investedAmount <= 0', () => {
    expect(parseFixedIncomeForm(validForm({ investedAmount: '0' })).ok).toBe(false);
  });

  it('rejeita investedAt inválida', () => {
    expect(parseFixedIncomeForm(validForm({ investedAt: '2026-02-30' })).ok).toBe(false);
    expect(parseFixedIncomeForm(validForm({ investedAt: '' })).ok).toBe(false);
  });

  it('rejeita maturityDate inválida', () => {
    expect(parseFixedIncomeForm(validForm({ maturityDate: '2026-13-40' })).ok).toBe(false);
  });

  it('rejeita maturityDate anterior a investedAt', () => {
    const result = parseFixedIncomeForm(
      validForm({ investedAt: '2026-06-01', maturityDate: '2026-01-01' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/vencimento/i);
  });

  it('rejeita rateType desconhecido', () => {
    const result = parseFixedIncomeForm(
      validForm({ rateType: 'INVALIDO' as FixedIncomeFormValues['rateType'] })
    );
    expect(result.ok).toBe(false);
  });

  it('rejeita rate não numérica', () => {
    expect(parseFixedIncomeForm(validForm({ rate: 'abc' })).ok).toBe(false);
  });

  it('rejeita currentValue sem currentValueDate e vice-versa', () => {
    expect(parseFixedIncomeForm(validForm({ currentValue: '100' })).ok).toBe(false);
    expect(parseFixedIncomeForm(validForm({ currentValueDate: '2026-06-01' })).ok).toBe(false);
  });

  it('rejeita currentValue negativo', () => {
    expect(
      parseFixedIncomeForm(validForm({ currentValue: '-1', currentValueDate: '2026-06-01' })).ok
    ).toBe(false);
  });

  it('rejeita currentValueDate inválida', () => {
    expect(
      parseFixedIncomeForm(validForm({ currentValue: '100', currentValueDate: '2026-99-99' })).ok
    ).toBe(false);
  });

  it('institution opcional vira undefined quando vazia', () => {
    const result = parseFixedIncomeForm(validForm({ institution: '  ' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.institution).toBeUndefined();
  });
});

describe('toFormValues', () => {
  it('converte uma posição existente em valores de formulário', () => {
    const position = makePosition({
      maturity_date: null,
      current_value: 1200,
      current_value_date: '2026-06-01',
    });
    expect(toFormValues(position)).toEqual({
      name: 'CDB Banco X',
      kind: 'CDB',
      institution: 'Banco X',
      investedAmount: '1000',
      investedAt: '2026-01-10',
      maturityDate: '',
      rateType: 'CDI',
      rate: '110',
      currentValue: '1200',
      currentValueDate: '2026-06-01',
    });
  });
});

describe('vocabulário', () => {
  it('EMPTY_FIXED_INCOME_FORM usa um kind/rateType válidos', () => {
    expect(FIXED_INCOME_KINDS).toContain(EMPTY_FIXED_INCOME_FORM.kind);
    expect(FIXED_INCOME_RATE_TYPES).toContain(EMPTY_FIXED_INCOME_FORM.rateType);
  });
});
