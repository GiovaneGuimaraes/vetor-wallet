import { applyOperation } from 'src/applyOperation';
import type { PositionEntry } from 'src/types';

describe('applyOperation', () => {
  it('BUY num ticker sem posição cria a posição e devolve o valor gravado no mapa', () => {
    const map = new Map<string, PositionEntry>();
    const updated = applyOperation(map, { ticker: 'PETR4', type: 'BUY', quantity: 10, price: 30 });

    expect(updated).toEqual({ quantity: 10, avgPrice: 30 });
    expect(map.get('PETR4')).toBe(updated);
  });

  it('BUY sobre posição existente recalcula o preço médio ponderado', () => {
    const map = new Map<string, PositionEntry>([['PETR4', { quantity: 10, avgPrice: 30 }]]);
    // (10 × 30 + 30 × 40) / 40 = 37,5
    expect(applyOperation(map, { ticker: 'PETR4', type: 'BUY', quantity: 30, price: 40 })).toEqual({
      quantity: 40,
      avgPrice: 37.5,
    });
  });

  it('SELL reduz a quantidade sem alterar o preço médio', () => {
    const map = new Map<string, PositionEntry>([['PETR4', { quantity: 10, avgPrice: 30 }]]);
    expect(applyOperation(map, { ticker: 'PETR4', type: 'SELL', quantity: 4, price: 99 })).toEqual({
      quantity: 6,
      avgPrice: 30,
    });
  });

  it('SELL num ticker sem posição fica em zero (piso defensivo)', () => {
    const map = new Map<string, PositionEntry>();
    expect(applyOperation(map, { ticker: 'VALE3', type: 'SELL', quantity: 5, price: 50 })).toEqual({
      quantity: 0,
      avgPrice: 0,
    });
  });

  it('não mexe nos outros tickers do mapa', () => {
    const vale = { quantity: 3, avgPrice: 80 };
    const map = new Map<string, PositionEntry>([['VALE3', vale]]);
    applyOperation(map, { ticker: 'PETR4', type: 'BUY', quantity: 1, price: 30 });
    expect(map.get('VALE3')).toBe(vale);
  });
});
