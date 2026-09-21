import { INCOME_SOURCE_TYPES, isIncomeSourceType } from 'src/INCOME_SOURCE_TYPES';

describe('INCOME_SOURCE_TYPES', () => {
  it('é a lista dos três tipos, em ordem estável (a mensagem de 400 a usa)', () => {
    expect(INCOME_SOURCE_TYPES).toEqual(['SALARIO', 'FREELA', 'OUTRO']);
  });

  it('reconhece os tipos válidos', () => {
    for (const type of INCOME_SOURCE_TYPES) expect(isIncomeSourceType(type)).toBe(true);
  });

  it('recusa desconhecido, caixa trocada e não-string', () => {
    for (const raw of ['SALARIO ', 'salario', 'BONUS', '', undefined, null, 1, {}]) {
      expect(isIncomeSourceType(raw)).toBe(false);
    }
  });
});
