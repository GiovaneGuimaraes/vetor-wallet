import { FIXED_INCOME_RATE_TYPES, isFixedIncomeRateType } from 'src/FIXED_INCOME_RATE_TYPES';

describe('FIXED_INCOME_RATE_TYPES', () => {
  it('são os quatro indexadores, em ordem estável', () => {
    expect(FIXED_INCOME_RATE_TYPES).toEqual(['PRE', 'CDI', 'IPCA', 'SELIC']);
  });

  it('reconhece os indexadores válidos', () => {
    for (const rateType of FIXED_INCOME_RATE_TYPES) {
      expect(isFixedIncomeRateType(rateType)).toBe(true);
    }
  });

  it('recusa desconhecido, caixa trocada e não-string', () => {
    for (const raw of ['IGPM', 'cdi', '', undefined, null, 100, {}, []]) {
      expect(isFixedIncomeRateType(raw)).toBe(false);
    }
  });
});
