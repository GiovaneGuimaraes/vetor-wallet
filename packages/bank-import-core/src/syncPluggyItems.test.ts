import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

/**
 * Sincronização dos N items de um usuário (T-089a).
 *
 * Banco temporário + `DATABASE_URL` ANTES do `await import('@vetor-wallet/db')`
 * (o client lê o env no top-level). O client da Pluggy é **injetado**, então não
 * há `fetch` para mockar: as deps são funções de mentira.
 */
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-pluggy-sync-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

import type { Db } from '@vetor-wallet/db';
import type { RawPluggyTransaction } from './pluggy';
import type { PluggySyncDeps, RawPluggyAccount } from './syncPluggyItems';

type SyncModule = typeof import('./syncPluggyItems');
type LinkModule = typeof import('./linkPluggyItem');

// UUIDs INVENTADOS — nenhum itemId real entra em arquivo versionado.
const ITEM_A = '7a1b2c3d-0000-4000-8000-aaaaaaaaaaaa';
const ITEM_B = '7a1b2c3d-0000-4000-8000-bbbbbbbbbbbb';

let db: Db;
let sync: SyncModule;
let link: LinkModule;
let userId: number;

function account(overrides: Partial<RawPluggyAccount> = {}): RawPluggyAccount {
  return { id: 'acc-1', name: 'Conta', type: 'BANK', subtype: 'CHECKING_ACCOUNT', ...overrides };
}

function tx(overrides: Partial<RawPluggyTransaction> = {}): RawPluggyTransaction {
  return {
    id: 'tx-1',
    date: '2026-08-11T00:00:00.000Z',
    description: 'Compra',
    descriptionRaw: null,
    amount: -10,
    type: 'DEBIT',
    category: null,
    currencyCode: 'BRL',
    status: 'POSTED',
    ...overrides,
  };
}

/** Deps de mentira: contas e transações por itemId/accountId, ou erro. */
function deps(config: {
  accounts?: Record<string, RawPluggyAccount[] | Error>;
  transactions?: Record<string, RawPluggyTransaction[] | Error>;
  calls?: { items: string[]; accounts: string[] };
}): PluggySyncDeps {
  return {
    async fetchAccounts(itemId) {
      config.calls?.items.push(itemId);
      const found = config.accounts?.[itemId] ?? [];
      if (found instanceof Error) throw found;
      return found;
    },
    async fetchTransactions({ accountId }) {
      config.calls?.accounts.push(accountId);
      const found = config.transactions?.[accountId] ?? [];
      if (found instanceof Error) throw found;
      return found;
    },
  };
}

beforeAll(async () => {
  const dbMod = await import('@vetor-wallet/db');
  db = dbMod.db;
  await dbMod.initDb();
  sync = await import('./syncPluggyItems');
  link = await import('./linkPluggyItem');
});

beforeEach(async () => {
  await db.execute('DELETE FROM income_entries');
  await db.execute('DELETE FROM expense_entries');
  await db.execute('DELETE FROM pluggy_items');
  await db.execute('DELETE FROM users');
  const inserted = await db.execute({
    sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    args: [`pluggy-sync-${Math.random().toString(36).slice(2)}@test.local`, 'x'],
  });
  userId = Number(inserted.lastInsertRowid ?? 0);
});

describe('syncPluggyItems (T-089a)', () => {
  it('usuário SEM item: devolve noItems, não "0 contas, sucesso"', async () => {
    const report = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps({}),
    });

    expect(report.noItems).toBe(true);
    expect(report.items).toEqual([]);
    expect(report.failures).toBe(0);
  });

  it('itera os N items do usuário e soma o relatório de todos', async () => {
    await link.linkPluggyItem({ db, userId, itemId: ITEM_A, connectorName: 'Banco A' });
    await link.linkPluggyItem({ db, userId, itemId: ITEM_B, connectorName: 'Banco B' });

    const calls = { items: [] as string[], accounts: [] as string[] };
    const report = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps({
        accounts: {
          [ITEM_A]: [account({ id: 'acc-a' })],
          [ITEM_B]: [account({ id: 'acc-b' })],
        },
        transactions: {
          'acc-a': [tx({ id: 'tx-a' })],
          'acc-b': [tx({ id: 'tx-b' }), tx({ id: 'tx-c', type: 'CREDIT', amount: 50 })],
        },
        calls,
      }),
    });

    expect(calls.items).toEqual([ITEM_A, ITEM_B]);
    expect(calls.accounts).toEqual(['acc-a', 'acc-b']);
    expect(report.noItems).toBe(false);
    expect(report.failures).toBe(0);
    expect(report.totals).toMatchObject({ imported: 3, duplicated: 0, rejected: 0 });
    expect(report.items).toHaveLength(2);
    expect(report.items[1].connectorName).toBe('Banco B');
  });

  it('falha ao listar contas de UM item não aborta os outros', async () => {
    await link.linkPluggyItem({ db, userId, itemId: ITEM_A });
    await link.linkPluggyItem({ db, userId, itemId: ITEM_B });

    const report = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps({
        accounts: {
          [ITEM_A]: new Error('Pluggy respondeu 403'),
          [ITEM_B]: [account({ id: 'acc-b' })],
        },
        transactions: { 'acc-b': [tx({ id: 'tx-b' })] },
      }),
    });

    expect(report.items[0]).toMatchObject({ itemId: ITEM_A, failures: 1 });
    expect(report.items[0].error).toContain('403');
    // O segundo item foi sincronizado apesar do primeiro ter falhado.
    expect(report.items[1].accounts[0].result).toMatchObject({ imported: 1 });
    expect(report.totals.imported).toBe(1);
    expect(report.failures).toBe(1);
  });

  it('falha em UMA conta não aborta as outras contas do mesmo item', async () => {
    await link.linkPluggyItem({ db, userId, itemId: ITEM_A });

    const report = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps({
        accounts: {
          [ITEM_A]: [
            account({ id: 'acc-ruim' }),
            account({ id: null, name: 'Sem id' }),
            account({ id: 'acc-boa' }),
          ],
        },
        transactions: {
          'acc-ruim': new Error('timeout'),
          'acc-boa': [tx({ id: 'tx-ok' })],
        },
      }),
    });

    expect(report.items[0].failures).toBe(2);
    expect(report.items[0].accounts[0].error).toBe('timeout');
    expect(report.items[0].accounts[1].error).toContain('sem id');
    expect(report.items[0].accounts[2].result).toMatchObject({ imported: 1 });
    expect(report.failures).toBe(2);
    expect(report.totals.imported).toBe(1);
  });

  it('item sem NENHUMA conta é falha com mensagem acionável, não sucesso vazio', async () => {
    await link.linkPluggyItem({ db, userId, itemId: ITEM_A });

    const report = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps({ accounts: { [ITEM_A]: [] } }),
    });

    expect(report.noItems).toBe(false);
    expect(report.failures).toBe(1);
    expect(report.items[0].error).toMatch(/nenhuma conta/i);
  });

  it('só sincroniza os items DO usuário — o item de outro é invisível', async () => {
    const other = await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      args: [`pluggy-sync-other-${Math.random().toString(36).slice(2)}@test.local`, 'x'],
    });
    const otherId = Number(other.lastInsertRowid ?? 0);
    await link.linkPluggyItem({ db, userId: otherId, itemId: ITEM_A });

    const calls = { items: [] as string[], accounts: [] as string[] };
    const report = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps({ accounts: { [ITEM_A]: [account()] }, calls }),
    });

    expect(report.noItems).toBe(true);
    expect(calls.items).toEqual([]);
  });

  it('cartão inverte o sinal esperado (accountKind derivado do tipo da conta)', async () => {
    await link.linkPluggyItem({ db, userId, itemId: ITEM_A });

    const report = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps({
        accounts: {
          [ITEM_A]: [account({ id: 'acc-cartao', type: 'CREDIT', subtype: 'CREDIT_CARD' })],
        },
        // Compra nova no cartão: DEBIT com valor POSITIVO.
        transactions: { 'acc-cartao': [tx({ id: 'tx-cartao', amount: 99.9 })] },
      }),
    });

    expect(report.totals).toMatchObject({ imported: 1, rejected: 0 });
    const rows = await db.execute('SELECT amount FROM expense_entries');
    expect(rows.rows[0].amount).toBe(99.9);
  });

  it('dry-run não grava nada e reporta previewed', async () => {
    await link.linkPluggyItem({ db, userId, itemId: ITEM_A });

    const report = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      dryRun: true,
      deps: deps({
        accounts: { [ITEM_A]: [account({ id: 'acc-a' })] },
        transactions: { 'acc-a': [tx({ id: 'tx-a' })] },
      }),
    });

    expect(report.totals).toMatchObject({ previewed: 1, imported: 0 });
    const rows = await db.execute('SELECT COUNT(*) AS c FROM expense_entries');
    expect(Number(rows.rows[0].c)).toBe(0);
  });

  it('reimportar os mesmos items é idempotente (dedupe da T-084 por trás)', async () => {
    await link.linkPluggyItem({ db, userId, itemId: ITEM_A });
    const config = {
      accounts: { [ITEM_A]: [account({ id: 'acc-a' })] },
      transactions: { 'acc-a': [tx({ id: 'tx-a' })] },
    };

    const first = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps(config),
    });
    const second = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps(config),
    });

    expect(first.totals).toMatchObject({ imported: 1, duplicated: 0 });
    expect(second.totals).toMatchObject({ imported: 0, duplicated: 1 });
    const rows = await db.execute('SELECT COUNT(*) AS c FROM expense_entries');
    expect(Number(rows.rows[0].c)).toBe(1);
  });

  it('soma a movimentação interna das DUAS pontas da fatura (T-088)', async () => {
    // O caso que contava a fatura duas vezes: conta e cartão são items/contas
    // diferentes, então o total só fecha se `internal` agregar como os demais.
    await link.linkPluggyItem({ db, userId, itemId: ITEM_A, connectorName: 'Conta' });
    await link.linkPluggyItem({ db, userId, itemId: ITEM_B, connectorName: 'Cartão' });

    const report = await sync.syncPluggyItems({
      db,
      userId,
      dateFrom: '2026-08-01',
      deps: deps({
        accounts: {
          [ITEM_A]: [account({ id: 'acc-conta' })],
          [ITEM_B]: [account({ id: 'acc-cartao', type: 'CREDIT' })],
        },
        transactions: {
          'acc-conta': [
            tx({ id: 'tx-mercado', amount: -60 }),
            tx({ id: 'tx-fatura-debito', amount: -430.19, category: 'Credit card payment' }),
          ],
          'acc-cartao': [
            tx({ id: 'tx-fatura-credito', amount: -430.19, category: 'Credit card payment' }),
          ],
        },
      }),
    });

    expect(report.totals).toMatchObject({ imported: 1, internal: 2, rejected: 0 });
    expect(report.failures).toBe(0);
    const rows = await db.execute('SELECT COUNT(*) AS c FROM expense_entries');
    expect(Number(rows.rows[0].c)).toBe(1);
  });
});

describe('pluggyAccountKindOf', () => {
  it('CREDIT (em qualquer caixa) é cartão; o resto é conta', async () => {
    expect(sync.pluggyAccountKindOf('CREDIT')).toBe('CREDIT');
    expect(sync.pluggyAccountKindOf(' credit ')).toBe('CREDIT');
    expect(sync.pluggyAccountKindOf('BANK')).toBe('BANK');
    expect(sync.pluggyAccountKindOf(null)).toBe('BANK');
  });
});
