import { describe, it, expect } from 'vitest';
import { summarizePluggyInvestments, UNTYPED_INVESTMENT_LABEL } from './summarizePluggyInvestments';
import { toPluggyInvestment } from './toPluggyInvestment';

describe('summarizePluggyInvestments (T-091d, fatia d1)', () => {
  it('conta por type, em ordem alfabética, e conta quem veio sem type', () => {
    const investments = [
      { id: 'a', type: 'FIXED_INCOME', name: 'CDB Exemplo', balance: 100, code: 'X1' },
      { id: 'b', type: 'EQUITY', name: 'Ação Exemplo', balance: 200 },
      { id: 'c', type: 'FIXED_INCOME', balance: 300 },
      { id: 'd' },
      { id: 'e', type: 'TIPO_NOVO' },
    ].map(toPluggyInvestment);

    const summary = summarizePluggyInvestments(investments);
    expect(summary).toEqual({
      total: 5,
      byType: { [UNTYPED_INVESTMENT_LABEL]: 1, EQUITY: 1, FIXED_INCOME: 2, TIPO_NOVO: 1 },
    });
    expect(Object.keys(summary.byType)).toEqual([
      UNTYPED_INVESTMENT_LABEL,
      'EQUITY',
      'FIXED_INCOME',
      'TIPO_NOVO',
    ]);
  });

  it('não carrega nome, valor, código nem id dos investimentos', () => {
    const summary = summarizePluggyInvestments(
      [{ id: 'inv-unico', type: 'ETF', name: 'Nome Exemplo', code: 'COD11', balance: 1234 }].map(
        toPluggyInvestment
      )
    );
    const serialized = JSON.stringify(summary);
    for (const leak of ['inv-unico', 'Nome Exemplo', 'COD11', '1234']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('lista vazia → total 0, nenhum type', () => {
    expect(summarizePluggyInvestments([])).toEqual({ total: 0, byType: {} });
  });
});
