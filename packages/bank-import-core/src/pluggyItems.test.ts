import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

/**
 * Items da Pluggy por usuário (T-089a) contra banco de verdade.
 *
 * O ponto destas funções é o comportamento do SQL (upsert por `item_id` único
 * global, filtro por `user_id`, `rowsAffected` do DELETE) — um `db` mockado
 * provaria só que a query foi chamada, não que ela faz o que promete. Por isso
 * aqui vai banco temporário, com `DATABASE_URL` setado ANTES do
 * `await import('@vetor-wallet/db')`: o client lê o env no top-level do módulo.
 *
 * As funções sob teste recebem `db` **injetado** e só usam `import type` de
 * `@vetor-wallet/db`, então elas podem ser importadas estaticamente. O barrel
 * (`./index`) não — ele arrasta `externalId.ts`, que importa o singleton `db`.
 */
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-pluggy-items-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

import type { Db } from '@vetor-wallet/db';
import { linkPluggyItem } from './linkPluggyItem';
import { listPluggyItems } from './listPluggyItems';
import { unlinkPluggyItem } from './unlinkPluggyItem';
import { PluggyItemError } from './PluggyItemError';

// UUIDs INVENTADOS — nenhum itemId real entra em arquivo versionado (repo público).
const ITEM_A = '6e3a1f7c-0000-4000-8000-aaaaaaaaaaaa';
const ITEM_B = '6e3a1f7c-0000-4000-8000-bbbbbbbbbbbb';

let db: Db;
let userA: number;
let userB: number;

async function createUser(): Promise<number> {
  const inserted = await db.execute({
    sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    args: [`pluggy-items-${Math.random().toString(36).slice(2)}@test.local`, 'x'],
  });
  return Number(inserted.lastInsertRowid ?? 0);
}

beforeAll(async () => {
  const dbMod = await import('@vetor-wallet/db');
  db = dbMod.db;
  await dbMod.initDb();
});

beforeEach(async () => {
  await db.execute('DELETE FROM pluggy_items');
  await db.execute('DELETE FROM users');
  userA = await createUser();
  userB = await createUser();
});

describe('linkPluggyItem (T-089a)', () => {
  it('registra um item novo com conector e status', async () => {
    const item = await linkPluggyItem({
      db,
      userId: userA,
      itemId: ITEM_A,
      connectorId: 200,
      connectorName: 'MeuPluggy',
      status: 'UPDATED',
    });

    expect(item).toMatchObject({
      userId: userA,
      itemId: ITEM_A,
      connectorId: 200,
      connectorName: 'MeuPluggy',
      status: 'UPDATED',
    });
    expect(item.id).toBeGreaterThan(0);
  });

  it('usa status UNKNOWN e conector nulo quando quem registra não sabe', async () => {
    const item = await linkPluggyItem({ db, userId: userA, itemId: ITEM_A });
    expect(item).toMatchObject({ status: 'UNKNOWN', connectorId: null, connectorName: null });
  });

  it('é idempotente: registrar o MESMO item duas vezes não duplica linha nem estoura', async () => {
    const first = await linkPluggyItem({ db, userId: userA, itemId: ITEM_A, status: 'UPDATED' });
    const second = await linkPluggyItem({
      db,
      userId: userA,
      itemId: ITEM_A,
      status: 'LOGIN_ERROR',
    });

    // Mesma linha, estado atualizado (reconexão mantém o itemId).
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('LOGIN_ERROR');

    const rows = await db.execute('SELECT COUNT(*) AS c FROM pluggy_items');
    expect(Number(rows.rows[0].c)).toBe(1);
  });

  it('o upsert preserva conector já conhecido quando o novo registro não o traz', async () => {
    await linkPluggyItem({
      db,
      userId: userA,
      itemId: ITEM_A,
      connectorId: 200,
      connectorName: 'MeuPluggy',
    });
    const again = await linkPluggyItem({ db, userId: userA, itemId: ITEM_A, status: 'UPDATED' });
    expect(again).toMatchObject({ connectorId: 200, connectorName: 'MeuPluggy' });
  });

  it('recusa o item que já é de OUTRO usuário, sem revelar de quem é e sem sobrescrever', async () => {
    await linkPluggyItem({ db, userId: userA, itemId: ITEM_A, status: 'UPDATED' });

    await expect(linkPluggyItem({ db, userId: userB, itemId: ITEM_A })).rejects.toMatchObject({
      code: 'ITEM_ALREADY_LINKED',
    });

    const rows = await db.execute('SELECT user_id, status FROM pluggy_items');
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0].user_id)).toBe(userA);
    // O DO UPDATE não casou: o status do dono ficou intacto.
    expect(rows.rows[0].status).toBe('UPDATED');
  });

  it('a mensagem de item já vinculado não cita usuário nem e-mail', async () => {
    await linkPluggyItem({ db, userId: userA, itemId: ITEM_A });
    const err = await linkPluggyItem({ db, userId: userB, itemId: ITEM_A }).catch((e) => e);
    expect(err).toBeInstanceOf(PluggyItemError);
    expect(String(err.message)).not.toMatch(/@|usuário \d|user_id/i);
  });

  it('rejeita itemId vazio, longo demais ou com formato inválido', async () => {
    for (const itemId of ['', '   ', 'a'.repeat(65), 'com espaço', 'quebra\nlinha']) {
      const err = await linkPluggyItem({ db, userId: userA, itemId }).catch((e) => e);
      expect(err).toBeInstanceOf(PluggyItemError);
      expect(err.code).toBe('INVALID_ITEM_ID');
    }
    const rows = await db.execute('SELECT COUNT(*) AS c FROM pluggy_items');
    expect(Number(rows.rows[0].c)).toBe(0);
  });

  it('trima o itemId antes de gravar (senão o mesmo item viraria duas chaves)', async () => {
    const item = await linkPluggyItem({ db, userId: userA, itemId: `  ${ITEM_A}  ` });
    expect(item.itemId).toBe(ITEM_A);

    const again = await linkPluggyItem({ db, userId: userA, itemId: ITEM_A });
    expect(again.id).toBe(item.id);
  });
});

describe('listPluggyItems (T-089a)', () => {
  it('devolve lista vazia para usuário sem item', async () => {
    expect(await listPluggyItems({ db, userId: userA })).toEqual([]);
  });

  it('devolve os N items do usuário', async () => {
    await linkPluggyItem({ db, userId: userA, itemId: ITEM_A });
    await linkPluggyItem({ db, userId: userA, itemId: ITEM_B });

    const items = await listPluggyItems({ db, userId: userA });
    expect(items.map((i) => i.itemId).sort()).toEqual([ITEM_A, ITEM_B].sort());
  });

  it('isolamento: o item de A não aparece para B', async () => {
    await linkPluggyItem({ db, userId: userA, itemId: ITEM_A });
    await linkPluggyItem({ db, userId: userB, itemId: ITEM_B });

    expect((await listPluggyItems({ db, userId: userA })).map((i) => i.itemId)).toEqual([ITEM_A]);
    expect((await listPluggyItems({ db, userId: userB })).map((i) => i.itemId)).toEqual([ITEM_B]);
  });
});

describe('unlinkPluggyItem (T-089a)', () => {
  it('remove o item do próprio usuário', async () => {
    await linkPluggyItem({ db, userId: userA, itemId: ITEM_A });
    expect(await unlinkPluggyItem({ db, userId: userA, itemId: ITEM_A })).toBe(true);
    expect(await listPluggyItems({ db, userId: userA })).toEqual([]);
  });

  it('devolve false — e não apaga nada — para item de outro usuário', async () => {
    await linkPluggyItem({ db, userId: userA, itemId: ITEM_A });
    expect(await unlinkPluggyItem({ db, userId: userB, itemId: ITEM_A })).toBe(false);
    expect((await listPluggyItems({ db, userId: userA })).map((i) => i.itemId)).toEqual([ITEM_A]);
  });

  it('devolve false para item inexistente e para itemId vazio', async () => {
    expect(await unlinkPluggyItem({ db, userId: userA, itemId: ITEM_B })).toBe(false);
    expect(await unlinkPluggyItem({ db, userId: userA, itemId: '  ' })).toBe(false);
  });

  it('depois de remover, o MESMO item pode ser registrado por outro usuário', async () => {
    await linkPluggyItem({ db, userId: userA, itemId: ITEM_A });
    await unlinkPluggyItem({ db, userId: userA, itemId: ITEM_A });

    const item = await linkPluggyItem({ db, userId: userB, itemId: ITEM_A });
    expect(item.userId).toBe(userB);
  });
});
