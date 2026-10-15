import { createSavingsEntry } from 'src/createSavingsEntry';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('createSavingsEntry', () => {
  it('insere e devolve a linha lida de volta', async () => {
    const criada = {
      id: 12,
      user_id: 7,
      type: 'DEPOSIT',
      amount: 50,
      date: '2026-09-20',
      note: '',
    };
    const { query, calls } = makeTestQuery([{ rows: [{ id: 12 }] }, { rows: [criada] }]);

    const entry = await createSavingsEntry({
      query,
      userId: 7,
      type: 'DEPOSIT',
      amount: 50,
      date: '2026-09-20',
      note: 'aporte',
    });

    expect(entry).toEqual(criada);
    expect(calls[0].text).toContain('INSERT INTO savings_entries');
    expect(calls[0].text).toContain('RETURNING id');
    expect(calls[0].values).toEqual([7, 'DEPOSIT', 50, '2026-09-20', 'aporte']);
  });

  it('o re-SELECT filtra por user_id, não só pelo id criado (T-059)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 12 }] }, { rows: [{ id: 12 }] }]);
    await createSavingsEntry({ query, userId: 7, type: 'YIELD', amount: 1, date: '2026-09-20' });
    expect(calls[1].text).toContain('WHERE id = $1 AND user_id = $2');
    expect(calls[1].values).toEqual([12, 7]);
  });

  it('note ausente grava string vazia, nunca null', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await createSavingsEntry({ query, userId: 7, type: 'DEPOSIT', amount: 5, date: '2026-09-20' });
    expect((calls[0].values as unknown[])[4]).toBe('');
  });

  it('sem linha de RETURNING cai em 0 em vez de quebrar', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, { rows: [] }]);
    await createSavingsEntry({ query, userId: 7, type: 'DEPOSIT', amount: 5, date: '2026-09-20' });
    expect(calls[1].values).toEqual([0, 7]);
  });
});

describe('createSavingsEntry — note nulo', () => {
  it('note: null (JSON do cliente) também grava string vazia', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await createSavingsEntry({
      query,
      userId: 7,
      type: 'DEPOSIT',
      amount: 5,
      date: '2026-09-20',
      note: null as unknown as string,
    });
    expect((calls[0].values as unknown[])[4]).toBe('');
  });
});
