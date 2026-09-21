import { describe, it, expect } from 'vitest';
import { deleteSavingsEntry } from './deleteSavingsEntry';
import { makeTestDb } from './testDb';

describe('deleteSavingsEntry', () => {
  it('devolve true quando apagou', async () => {
    const { db, calls } = makeTestDb([{ rowsAffected: 1 }]);

    expect(await deleteSavingsEntry({ db, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].sql).toContain('DELETE FROM savings_entries WHERE id = ? AND user_id = ?');
    expect(calls[0].args).toEqual([3, 7]);
  });

  it('devolve false quando nada foi apagado (inexistente ou de outro usuário)', async () => {
    const { db } = makeTestDb([{ rowsAffected: 0 }]);
    expect(await deleteSavingsEntry({ db, userId: 7, id: 3 })).toBe(false);
  });
});
