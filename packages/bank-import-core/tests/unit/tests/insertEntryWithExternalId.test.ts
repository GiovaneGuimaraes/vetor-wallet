import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';
import type { Query, QueryResult } from '@vetor-wallet/query';
import { insertEntryWithExternalId } from 'src/insertEntryWithExternalId';
import { duplicateEntryResponse } from 'src/duplicateEntryResponse';

/** `Query` de mentira: devolve os resultados na ordem das chamadas. */
function fakeQuery(results: Array<Partial<QueryResult>>) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  let i = 0;
  const query = vi.fn(async (input: unknown) => {
    const { text, values } = input as { text: string; values: unknown[] };
    calls.push({ text, values });
    return { rows: [], rowCount: 0, ...(results[i++] ?? {}) };
  }) as unknown as Query;
  return { query, calls };
}

const values = { description: 'Mercado', amount: 10, date: '2026-08-11' };

describe('insertEntryWithExternalId — contra um Query de mentira (T-116c)', () => {
  it('cria: INSERT … ON CONFLICT DO NOTHING RETURNING id e re-SELECT filtrado por user_id', async () => {
    const created = { id: 5, user_id: 7, external_id: 'ofx:A' };
    const { query, calls } = fakeQuery([{ rows: [{ id: 5 }] }, { rows: [created] }]);

    const result = await insertEntryWithExternalId({
      query,
      table: 'expense_entries',
      userId: 7,
      values,
      externalId: 'ofx:A',
    });

    expect(result).toEqual({ status: 'created', row: created });
    expect(calls[0].text).toContain(
      'ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL'
    );
    expect(calls[0].text).toContain('DO NOTHING');
    expect(calls[0].text).toContain('RETURNING id');
    expect(calls[0].values).toEqual([7, 'Mercado', 10, '2026-08-11', 'ofx:A']);
    expect(calls[1].values).toEqual([5, 7]);
  });

  it('nenhum $N se repete na query (o adaptador SQLite traduz por ordem de aparição)', async () => {
    const { query, calls } = fakeQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await insertEntryWithExternalId({
      query,
      table: 'income_entries',
      userId: 1,
      values,
      externalId: 'x',
    });
    for (const call of calls) {
      const placeholders = call.text.match(/\$\d+/g) ?? [];
      expect(new Set(placeholders).size).toBe(placeholders.length);
      expect(placeholders.length).toBe(call.values.length);
    }
  });

  it('INSERT sem linha devolvida É duplicata — sem depender de exceção de nenhum banco', async () => {
    const existing = { id: 3, user_id: 7, external_id: 'ofx:A' };
    const { query, calls } = fakeQuery([{ rows: [] }, { rows: [existing] }]);

    const result = await insertEntryWithExternalId({
      query,
      table: 'expense_entries',
      userId: 7,
      values,
      externalId: 'ofx:A',
    });

    expect(result).toEqual({ status: 'duplicate', row: existing });
    expect(calls[1].values).toEqual([7, 'ofx:A']);
  });

  it('duplicata cuja linha sumiu entre o INSERT e o SELECT devolve row undefined', async () => {
    const { query } = fakeQuery([{ rows: [] }, { rows: [] }]);
    const result = await insertEntryWithExternalId({
      query,
      table: 'expense_entries',
      userId: 7,
      values,
      externalId: 'ofx:A',
    });
    expect(result).toEqual({ status: 'duplicate', row: undefined });
  });

  it('erro do banco sobe (só conflito de external_id é duplicata)', async () => {
    const boom = new Error('connection refused');
    const query = vi.fn(async () => {
      throw boom;
    }) as unknown as Query;
    await expect(
      insertEntryWithExternalId({
        query,
        table: 'expense_entries',
        userId: 1,
        values,
        externalId: 'ofx:A',
      })
    ).rejects.toBe(boom);
  });

  it('lançamento manual (external_id null) cria normalmente', async () => {
    const { query, calls } = fakeQuery([{ rows: [{ id: 9 }] }, { rows: [{ id: 9 }] }]);
    const result = await insertEntryWithExternalId({
      query,
      table: 'expense_entries',
      userId: 1,
      values,
      externalId: null,
    });
    expect(result.status).toBe('created');
    expect(calls[0].values?.at(-1)).toBeNull();
  });

  it('INSERT manual que não devolve linha é erro, não "duplicata"', async () => {
    const { query } = fakeQuery([{ rows: [] }]);
    await expect(
      insertEntryWithExternalId({
        query,
        table: 'expense_entries',
        userId: 1,
        values,
        externalId: null,
      })
    ).rejects.toThrow('INSERT não devolveu a linha criada');
  });

  it('id ausente no RETURNING cai em 0 em vez de quebrar', async () => {
    const { query, calls } = fakeQuery([{ rows: [{}] }, { rows: [] }]);
    const result = await insertEntryWithExternalId({
      query,
      table: 'expense_entries',
      userId: 1,
      values,
      externalId: 'a',
    });
    expect(result).toEqual({ status: 'created', row: undefined });
    expect(calls[1].values).toEqual([0, 1]);
  });

  it('recusa nome de coluna fora do formato (guard contra SQL injection)', async () => {
    const { query } = fakeQuery([]);
    await expect(
      insertEntryWithExternalId({
        query,
        table: 'expense_entries',
        userId: 1,
        values: { 'amount) VALUES (1); --': 1 },
        externalId: 'a',
      })
    ).rejects.toThrow('Coluna inválida');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('insertEntryWithExternalId — contra SQLite de verdade (dedupe da T-084)', () => {
  it('a duplicata vira "duplicate" com a linha existente — não vira exceção/500', async () => {
    const dbPath = path.join(
      tmpdir(),
      `vetor-wallet-test-insert-ext-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;
    const { db, initDb } = await import('@vetor-wallet/db');
    const { createSqliteQuery } = await import('@vetor-wallet/query');
    await initDb();
    const query = createSqliteQuery(db);
    const inserted = await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      args: [`insert-ext-${Math.random().toString(36).slice(2)}@test.local`, 'x'],
    });
    const userId = Number(inserted.lastInsertRowid ?? 0);

    const params = {
      query,
      table: 'expense_entries' as const,
      userId,
      values: { ...values, category: 'mercado' },
      externalId: 'ofx:FIT-1',
    };
    const first = await insertEntryWithExternalId(params);
    const second = await insertEntryWithExternalId(params);

    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    expect(second.row?.id).toBe(first.row?.id);
    // E é isso que a rota devolve como 409.
    expect(duplicateEntryResponse(second.row)).toMatchObject({ duplicate: true });

    // Manuais (external_id NULL) não colidem entre si.
    const manual = { ...params, externalId: null };
    expect((await insertEntryWithExternalId(manual)).status).toBe('created');
    expect((await insertEntryWithExternalId(manual)).status).toBe('created');

    const count = await db.execute({
      sql: 'SELECT COUNT(*) AS c FROM expense_entries WHERE user_id = ?',
      args: [userId],
    });
    expect(Number(count.rows[0].c)).toBe(3);
  });
});
