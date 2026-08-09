import { MAX_MONEY_AMOUNT } from 'src/MAX_MONEY_AMOUNT';

describe('MAX_MONEY_AMOUNT', () => {
  it('é 10 trilhões (1e13)', () => {
    expect(MAX_MONEY_AMOUNT).toBe(1e13);
  });
});
