import { moneyRangeError } from 'src/moneyRangeError';

describe('moneyRangeError', () => {
  it('menciona o campo e o limite máximo', () => {
    expect(moneyRangeError('amount')).toMatch(/amount/);
    expect(moneyRangeError('amount')).toMatch(/limite máximo/);
  });

  it('usa "amount" como campo default', () => {
    expect(moneyRangeError()).toMatch(/^amount /);
  });
});
