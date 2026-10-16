import { getPositionQuantity } from 'src/getPositionQuantity';

describe('getPositionQuantity', () => {
  it('devolve a quantidade detida do ticker', () => {
    const map = new Map([['PETR4', { quantity: 12, avgPrice: 30 }]]);
    expect(getPositionQuantity(map, 'PETR4')).toBe(12);
  });

  it('ticker sem posição conta como 0', () => {
    expect(getPositionQuantity(new Map(), 'PETR4')).toBe(0);
  });
});
