import { FIXED_INCOME_KINDS, isFixedIncomeKind } from 'src/FIXED_INCOME_KINDS';

describe('FIXED_INCOME_KINDS', () => {
  it('é o vocabulário aprovado pelo humano, em ordem estável', () => {
    expect(FIXED_INCOME_KINDS).toEqual([
      'CAIXINHA',
      'CDB',
      'LCI',
      'LCA',
      'TESOURO',
      'DEBENTURE',
      'CRI_CRA',
      'OUTRO',
    ]);
  });

  it('reconhece os tipos válidos', () => {
    for (const kind of FIXED_INCOME_KINDS) expect(isFixedIncomeKind(kind)).toBe(true);
  });

  it('recusa desconhecido, caixa trocada e não-string', () => {
    for (const raw of ['POUPANCA', 'cdb', '', undefined, null, 1, {}, []]) {
      expect(isFixedIncomeKind(raw)).toBe(false);
    }
  });
});
