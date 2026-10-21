import { describe, it, expect } from 'vitest';
import { toPluggyInvestment } from './toPluggyInvestment';
import { toPluggyFixedIncomePosition } from './toPluggyFixedIncomePosition';

// Fixture sintética (valores redondos, nomes genéricos) — nunca dado real.
const CDB = {
  id: 'inv-1',
  itemId: 'item-1',
  type: 'FIXED_INCOME',
  subtype: 'CDB',
  name: 'CDB Exemplo',
  currencyCode: 'BRL',
  balance: 1100,
  amount: 1090,
  amountOriginal: 1000,
  rateType: 'CDI',
  rate: 100,
  date: '2026-01-31T00:00:00.000Z',
  dueDate: '2028-01-31T00:00:00.000Z',
  issuer: 'Banco Emissor',
  institution: { name: 'Corretora Exemplo', number: '000' },
};

function map(raw: Record<string, unknown>) {
  return toPluggyFixedIncomePosition(toPluggyInvestment(raw));
}

describe('toPluggyFixedIncomePosition (T-091d, fatia d2)', () => {
  it('traduz uma posição FIXED_INCOME completa, com id e sem itemId', () => {
    expect(map(CDB)).toEqual({
      id: 'inv-1',
      name: 'CDB Exemplo',
      subtype: 'CDB',
      institution: 'Banco Emissor',
      investedAmount: 1000,
      currentValue: 1100,
      currentValueDate: '2026-01-31',
      maturityDate: '2028-01-31',
      rateType: 'CDI',
      rate: 100,
    });
  });

  it('carrega o id do investimento (vínculo da d3), nunca o itemId (credencial portadora)', () => {
    const position = map(CDB);
    expect(position?.id).toBe('inv-1');
    expect(position).not.toHaveProperty('itemId');
    expect(JSON.stringify(position)).not.toContain('item-1');
  });

  it.each(['EQUITY', 'MUTUAL_FUND', 'ETF', 'COE', 'SECURITY', 'OTHER', 'ALGO_NOVO'])(
    'type %s fica de fora (null) — escopo da fatia, não bug',
    (type) => {
      expect(map({ ...CDB, type })).toBeNull();
    }
  );

  it('type ausente fica de fora', () => {
    expect(map({ ...CDB, type: undefined })).toBeNull();
  });

  it('moeda diferente de BRL fica de fora (não soma dólar com real)', () => {
    expect(map({ ...CDB, currencyCode: 'USD' })).toBeNull();
  });

  it('moeda ausente passa; caixa da moeda não importa', () => {
    expect(map({ ...CDB, currencyCode: undefined })).not.toBeNull();
    expect(map({ ...CDB, currencyCode: 'brl' })).not.toBeNull();
  });

  it('sem balance, usa amount como saldo', () => {
    expect(map({ ...CDB, balance: undefined })?.currentValue).toBe(1090);
  });

  it('sem balance nem amount, saldo é null — nunca 0 nem o valor aplicado', () => {
    const position = map({ ...CDB, balance: undefined, amount: undefined });
    expect(position?.currentValue).toBeNull();
    expect(position?.investedAmount).toBe(1000);
  });

  it('sem issuer, usa a instituição; sem nenhum dos dois, null', () => {
    expect(map({ ...CDB, issuer: undefined })?.institution).toBe('Corretora Exemplo');
    expect(map({ ...CDB, issuer: undefined, institution: undefined })?.institution).toBeNull();
  });

  it('datas ausentes ou fora do formato ISO viram null', () => {
    const position = map({ ...CDB, date: undefined, dueDate: '31/01/2028' });
    expect(position?.currentValueDate).toBeNull();
    expect(position?.maturityDate).toBeNull();
  });

  it('posição mínima: só o type — tudo o mais null, nada inventado', () => {
    expect(map({ type: 'FIXED_INCOME' })).toEqual({
      id: null,
      name: null,
      subtype: null,
      institution: null,
      investedAmount: null,
      currentValue: null,
      currentValueDate: null,
      maturityDate: null,
      rateType: null,
      rate: null,
    });
  });
});
