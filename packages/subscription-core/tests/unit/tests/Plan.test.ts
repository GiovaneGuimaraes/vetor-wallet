import { type PlanRow, toPlan } from 'src/Plan';

const row: PlanRow = {
  id: 1,
  code: 'pro-monthly',
  name: 'Pro Mensal',
  description: 'Tudo liberado',
  price_cents: 2990,
  interval: 'monthly',
  active: 1,
};

describe('toPlan', () => {
  test('projeta a linha com active como boolean', () => {
    expect(toPlan(row)).toEqual({
      id: 1,
      code: 'pro-monthly',
      name: 'Pro Mensal',
      description: 'Tudo liberado',
      price_cents: 2990,
      interval: 'monthly',
      active: true,
    });
  });

  test('active = 0 vira false', () => {
    expect(toPlan({ ...row, active: 0 }).active).toBe(false);
  });

  test('preço fica em CENTAVOS — formatar é papel da UI', () => {
    expect(toPlan({ ...row, price_cents: 29900 }).price_cents).toBe(29900);
  });

  test('normaliza os tipos que o driver devolve como string', () => {
    const driverRow = {
      ...row,
      id: '7',
      price_cents: '2990',
      active: '1',
    } as unknown as PlanRow;

    expect(toPlan(driverRow)).toMatchObject({ id: 7, price_cents: 2990, active: true });
  });
});
