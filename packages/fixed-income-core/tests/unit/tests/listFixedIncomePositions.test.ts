import { listFixedIncomePositions } from 'src/listFixedIncomePositions';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listFixedIncomePositions', () => {
  it('filtra por user_id e devolve as linhas', async () => {
    const rows = [{ id: 1, user_id: 7, name: 'Caixinha', invested_amount: 100 }];
    const { query, calls } = makeTestQuery([{ rows }]);

    expect(await listFixedIncomePositions({ query, userId: 7 })).toEqual(rows);
    expect(calls[0].text).toContain('FROM fixed_income_positions WHERE user_id = $1');
    expect(calls[0].values).toEqual([7]);
  });

  it('ordena da aplicação mais recente para a mais antiga, id de desempate', async () => {
    const { query, calls } = makeTestQuery();
    await listFixedIncomePositions({ query, userId: 1 });
    expect(calls[0].text).toContain('ORDER BY invested_at DESC, id DESC');
  });

  it('usuário sem posições devolve lista vazia', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await listFixedIncomePositions({ query, userId: 99 })).toEqual([]);
  });
});
