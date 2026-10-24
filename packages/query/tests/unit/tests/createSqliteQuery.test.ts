import type { Db } from '@vetor-wallet/db';
import { createSqliteQuery } from 'src/createSqliteQuery';

function dbQueDevolve(result: { rows: unknown[]; rowsAffected: number }) {
  const execute = jest.fn(async () => result);
  return { db: { execute, batch: jest.fn() } as unknown as Db, execute };
}

describe('createSqliteQuery', () => {
  it('traduz $1/$2 para ? na ordem de aparição e passa values como args', async () => {
    const { db, execute } = dbQueDevolve({ rows: [], rowsAffected: 0 });
    const query = createSqliteQuery(db);

    await query({
      text: 'SELECT * FROM t WHERE a = $1 AND b = $2 AND c IN ($3, $4)',
      values: [1, 'x', 3, 4],
    });

    expect(execute).toHaveBeenCalledWith({
      sql: 'SELECT * FROM t WHERE a = ? AND b = ? AND c IN (?, ?)',
      args: [1, 'x', 3, 4],
    });
  });

  it('placeholders de dois dígitos viram um único ?', async () => {
    const { db, execute } = dbQueDevolve({ rows: [], rowsAffected: 0 });
    const values = Array.from({ length: 11 }, (_, i) => i + 1);
    const text = `INSERT INTO t VALUES (${values.map((v) => `$${v}`).join(', ')})`;

    await createSqliteQuery(db)({ text, values });

    expect(execute).toHaveBeenCalledWith({
      sql: `INSERT INTO t VALUES (${values.map(() => '?').join(', ')})`,
      args: values,
    });
  });

  it('devolve rows e rowCount (de rowsAffected)', async () => {
    const { db } = dbQueDevolve({ rows: [{ id: 7, user_id: 3 }], rowsAffected: 2 });

    const result = await createSqliteQuery(db)({ text: 'UPDATE t SET x = $1', values: [1] });

    expect(result).toEqual({ rows: [{ id: 7, user_id: 3 }], rowCount: 2 });
  });

  it('aceita SQL cru como string, com args vazio', async () => {
    const { db, execute } = dbQueDevolve({ rows: [], rowsAffected: 0 });

    await createSqliteQuery(db)('SELECT 1');

    expect(execute).toHaveBeenCalledWith({ sql: 'SELECT 1', args: [] });
  });

  it('config sem values vira args vazio', async () => {
    const { db, execute } = dbQueDevolve({ rows: [], rowsAffected: 0 });

    await createSqliteQuery(db)({ text: 'SELECT 1' });

    expect(execute).toHaveBeenCalledWith({ sql: 'SELECT 1', args: [] });
  });

  it('propaga o erro do db sem engolir', async () => {
    const execute = jest.fn(async () => {
      throw new Error('SQLITE_CONSTRAINT_UNIQUE');
    });
    const db = { execute, batch: jest.fn() } as unknown as Db;

    await expect(createSqliteQuery(db)('INSERT INTO t VALUES (1)')).rejects.toThrow(
      'SQLITE_CONSTRAINT_UNIQUE'
    );
  });
});
