import { summariseFixedIncome } from 'src/summariseFixedIncome';

describe('summariseFixedIncome', () => {
  it('sem posições, os dois totais são zero', () => {
    expect(summariseFixedIncome([])).toEqual({ totalInvested: 0, totalCurrent: 0 });
  });

  it('sem saldo informado, o atual é o próprio valor aplicado', () => {
    expect(
      summariseFixedIncome([
        { invested_amount: 1000, current_value: null },
        { invested_amount: 250.5, current_value: null },
      ])
    ).toEqual({ totalInvested: 1250.5, totalCurrent: 1250.5 });
  });

  it('com saldo informado, o atual usa o saldo — e nunca estima por taxa', () => {
    expect(
      summariseFixedIncome([
        { invested_amount: 1000, current_value: 1080.25 },
        { invested_amount: 500, current_value: null },
      ])
    ).toEqual({ totalInvested: 1500, totalCurrent: 1580.25 });
  });

  it('saldo informado igual a zero é saldo zero, não "ausente"', () => {
    expect(summariseFixedIncome([{ invested_amount: 300, current_value: 0 }])).toEqual({
      totalInvested: 300,
      totalCurrent: 0,
    });
  });

  it('soma em centavos: 0,10 + 0,20 fecha em 0,30', () => {
    expect(
      summariseFixedIncome([
        { invested_amount: 0.1, current_value: 0.1 },
        { invested_amount: 0.2, current_value: 0.2 },
      ])
    ).toEqual({ totalInvested: 0.3, totalCurrent: 0.3 });
  });
});
