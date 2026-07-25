import { Store } from 'express-session';
import type { SessionData } from 'express-session';
import type { Client } from '@libsql/client';

/**
 * Store de sessão do `express-session` persistido no MESMO banco SQLite/libsql
 * do app (tabela `sessions`, criada em `initDb()`), em vez do MemoryStore
 * padrão — que perde todas as sessões a cada restart do server (ver
 * "Sessões não persistem no restart" no CLAUDE.md, agora resolvido).
 *
 * Decisões de projeto:
 *
 * - **TTL**: derivado de `cookie.maxAge` (ms) quando presente — é o mesmo TTL
 *   que o cookie já expressa, então reaproveitá-lo evita duas fontes de
 *   verdade. Fallback documentado: 24h (`DEFAULT_TTL_MS`) quando `maxAge` é
 *   `undefined`/`null` (cookie de sessão, sem expiração explícita) — escolha
 *   conservadora para não deixar linhas de `sessions` acumulando para sempre
 *   num banco local.
 * - **Expiração é lazy-delete no `get`**: uma sessão com `expires_at` no
 *   passado retorna `null` (o `express-session` trata como sessão inexistente)
 *   e a linha é apagada na mesma chamada. Não há um cron/job de limpeza
 *   contínuo — rodar limpeza em toda leitura já garante que linhas expiradas
 *   nunca são lidas como válidas, e o único custo de manter linhas mortas até
 *   a próxima leitura é espaço em disco, aceitável para o volume do app.
 * - **Varredura no boot**: `initDb()` roda um `DELETE FROM sessions WHERE
 *   expires_at <= ?` com o instante atual em ISO string como parâmetro (nunca
 *   `datetime('now')` do SQLite — o separador `T` vs espaço quebraria a
 *   comparação lexicográfica) uma vez ao iniciar, para não acumular
 *   sessões expiradas de execuções antigas que nunca mais serão lidas (ex.:
 *   sessão de um usuário que nunca mais volta) — sem isso, o lazy-delete só
 *   limpa o que é efetivamente consultado.
 * - **Callbacks nunca lançam síncrono**: todo método é `async`/promise-based
 *   e delega erros ao callback (`cb(err)`), nunca lança/rejeita sem passar
 *   pelo callback — um throw síncrono aqui derrubaria o server, já que
 *   `express-session` não faz `try/catch` ao invocar os métodos do Store.
 */
export class SqliteSessionStore extends Store {
  private readonly db: Client;
  private readonly defaultTtlMs: number;

  constructor(db: Client, options: { defaultTtlMs?: number } = {}) {
    super();
    this.db = db;
    this.defaultTtlMs = options.defaultTtlMs ?? 24 * 60 * 60 * 1000;
  }

  private ttlMsFor(session: SessionData): number {
    const maxAge = session.cookie?.maxAge;
    return typeof maxAge === 'number' && Number.isFinite(maxAge) && maxAge > 0
      ? maxAge
      : this.defaultTtlMs;
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    void (async () => {
      try {
        const result = await this.db.execute({
          sql: 'SELECT data, expires_at FROM sessions WHERE sid = ?',
          args: [sid],
        });
        const row = result.rows[0];
        if (!row) {
          callback(null, null);
          return;
        }

        const expiresAt = new Date(String(row.expires_at)).getTime();
        if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
          // Sessão expirada: lazy-delete e reporta como inexistente.
          await this.db.execute({ sql: 'DELETE FROM sessions WHERE sid = ?', args: [sid] });
          callback(null, null);
          return;
        }

        const session = JSON.parse(String(row.data)) as SessionData;
        callback(null, session);
      } catch (err) {
        callback(err);
      }
    })();
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    void (async () => {
      try {
        const ttlMs = this.ttlMsFor(session);
        const expiresAt = new Date(Date.now() + ttlMs).toISOString();
        const data = JSON.stringify(session);
        await this.db.execute({
          sql: `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
                ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
          args: [sid, data, expiresAt],
        });
        callback?.();
      } catch (err) {
        callback?.(err);
      }
    })();
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    void (async () => {
      try {
        await this.db.execute({ sql: 'DELETE FROM sessions WHERE sid = ?', args: [sid] });
        callback?.();
      } catch (err) {
        callback?.(err);
      }
    })();
  }

  touch(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    void (async () => {
      try {
        const ttlMs = this.ttlMsFor(session);
        const expiresAt = new Date(Date.now() + ttlMs).toISOString();
        // Só renova expires_at de uma sessão que ainda existe; se a linha já
        // tiver sido removida (destroy/lazy-delete concorrente), não recria.
        await this.db.execute({
          sql: 'UPDATE sessions SET expires_at = ? WHERE sid = ?',
          args: [expiresAt, sid],
        });
        callback?.();
      } catch (err) {
        callback?.(err);
      }
    })();
  }
}
