import { getActivePlan } from 'src/getActivePlan';
import { createTestQuery } from 'tests/unit/testQuery';

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
  let query: ReturnType<typeof createTestQuery>;

  beforeEach(() => {
    query = createTestQuery();
  });

  test('busca o plano por id e devolve a linha crua', async () => {
    query.mockResolvedValue({ rows: [planRow], rowCount: 1 });

    const result = await getActivePlan({ query, planId: 1 });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.any(String), values: [1] })
    );
    expect(query.mock.calls[0][0].text).toMatchSnapshot();
    expect(result).toEqual(planRow);
  });

  test('NÃO filtra por active — plano desativado segue resolvível', async () => {
    // Quem já assinou precisa do plano resolvido na leitura; filtrar aqui faria
    // a assinatura de um plano descontinuado aparecer sem nome.
    query.mockResolvedValue({ rows: [{ ...planRow, active: 0 }], rowCount: 1 });

    const result = await getActivePlan({ query, planId: 1 });

    expect(query.mock.calls[0][0].text).not.toMatch(/active/i);
    expect(result).toMatchObject({ active: 0 });
  });

  test('plano inexistente vira null, não undefined', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(getActivePlan({ query, planId: 999 })).resolves.toBeNull();
  });
});
