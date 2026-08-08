import { getActivePlan } from 'src/getActivePlan';
import { createMockDb, type MockDb } from 'tests/unit/createMockDb';

const planRow = {
  id: 1,
  code: 'pro-monthly',
  name: 'Pro Mensal',
  description: 'Tudo liberado',
  price_cents: 2990,
  interval: 'monthly',
  active: 1,
};

describe('getActivePlan', () => {
  let db: MockDb;

  beforeEach(() => {
    db = createMockDb();
  });

  test('busca o plano por id e devolve a linha crua', async () => {
    db.execute.mockResolvedValue({ rows: [planRow] });

    const result = await getActivePlan({ db, planId: 1 });

    expect(db.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.any(String), args: [1] }),
    );
    expect(db.execute.mock.calls[0][0].sql).toMatchSnapshot();
    expect(result).toEqual(planRow);
  });

  test('NÃO filtra por active — plano desativado segue resolvível', async () => {
    // Quem já assinou precisa do plano resolvido na leitura; filtrar aqui faria
    // a assinatura de um plano descontinuado aparecer sem nome.
    db.execute.mockResolvedValue({ rows: [{ ...planRow, active: 0 }] });

    const result = await getActivePlan({ db, planId: 1 });

    expect(db.execute.mock.calls[0][0].sql).not.toMatch(/active/i);
    expect(result).toMatchObject({ active: 0 });
  });

  test('plano inexistente vira null, não undefined', async () => {
    db.execute.mockResolvedValue({ rows: [] });

    await expect(getActivePlan({ db, planId: 999 })).resolves.toBeNull();
  });
});
