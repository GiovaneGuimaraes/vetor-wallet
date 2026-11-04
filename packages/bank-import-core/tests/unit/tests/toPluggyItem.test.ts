import { describe, it, expect } from 'vitest';
import { toPluggyItem } from 'src/toPluggyItem';
import { UNKNOWN_PLUGGY_ITEM_STATUS } from 'src/UNKNOWN_PLUGGY_ITEM_STATUS';
import { PluggyItemError } from 'src/PluggyItemError';
import { duplicateEntryResponse } from 'src/duplicateEntryResponse';

describe('toPluggyItem', () => {
  it('projeta a linha do banco em camelCase', () => {
    expect(
      toPluggyItem({
        id: 1,
        user_id: 2,
        item_id: 'abc',
        connector_id: 200,
        connector_name: 'Banco',
        status: 'UPDATED',
        created_at: '2026-01-01 00:00:00',
        updated_at: '2026-01-02 00:00:00',
      })
    ).toEqual({
      id: 1,
      userId: 2,
      itemId: 'abc',
      connectorId: 200,
      connectorName: 'Banco',
      status: 'UPDATED',
      createdAt: '2026-01-01 00:00:00',
      updatedAt: '2026-01-02 00:00:00',
    });
  });

  it('conector nulo continua nulo', () => {
    const item = toPluggyItem({
      id: 1,
      user_id: 2,
      item_id: 'abc',
      connector_id: null,
      connector_name: null,
      status: UNKNOWN_PLUGGY_ITEM_STATUS,
      created_at: 'a',
      updated_at: 'b',
    });
    expect(item).toMatchObject({ connectorId: null, connectorName: null, status: 'UNKNOWN' });
  });
});

describe('PluggyItemError', () => {
  it('carrega o código tipado', () => {
    const err = new PluggyItemError('INVALID_ITEM_ID', 'x');
    expect(err.code).toBe('INVALID_ITEM_ID');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('duplicateEntryResponse', () => {
  it('traz a linha existente quando há', () => {
    expect(duplicateEntryResponse({ id: 1 })).toEqual({
      error: 'Lançamento já importado (externalId duplicado)',
      duplicate: true,
      entry: { id: 1 },
    });
  });

  it('entry null quando a linha sumiu', () => {
    expect(duplicateEntryResponse(undefined).entry).toBeNull();
  });
});
