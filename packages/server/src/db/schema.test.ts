import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário próprio por arquivo de teste. `import` estático de '../db'
// seria hoisted acima do set de DATABASE_URL, então o módulo db é importado
// dinamicamente dentro do beforeAll (mesmo padrão dos testes de rota).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-db-schema-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type Db = typeof import('./index')['db'];

/**
 * T-064: índice em quote_snapshots(ticker, captured_at) para evitar full scan
 * na query do piso de data usada por /portfolio/history (T-063).
 */
describe('initDb — índice idx_snapshots_ticker_time', () => {
  let db: Db;

  beforeAll(async () => {
    const mod = await import('./index');
    db = mod.db;
    await mod.initDb();
  });

  it('cria o índice idx_snapshots_ticker_time em quote_snapshots(ticker, captured_at)', async () => {
    const res = await db.execute({
      sql: `SELECT name, tbl_name, sql FROM sqlite_master
            WHERE type = 'index' AND name = ?`,
      args: ['idx_snapshots_ticker_time'],
    });

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].tbl_name).toBe('quote_snapshots');
    expect(String(res.rows[0].sql)).toContain('ticker');
    expect(String(res.rows[0].sql)).toContain('captured_at');
  });

  it('roda de novo sem erro (idempotente)', async () => {
    const mod = await import('./index');
    await mod.initDb();
    await mod.initDb();

    const res = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM sqlite_master
            WHERE type = 'index' AND name = ?`,
      args: ['idx_snapshots_ticker_time'],
    });
    expect(Number(res.rows[0].cnt)).toBe(1);
  });
});
