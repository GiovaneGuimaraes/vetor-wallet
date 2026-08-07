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
 * - **`expires_at` corrompido/não-ISO é fail-closed** (T-046): `get` trata
 *   qualquer valor que não vire uma data finita (`Number.isFinite`) como
 *   sessão expirada — nunca como "sem expiração"/válida para sempre. A linha
 *   é apagada (mesma lazy-delete de uma expiração normal) e o callback
 *   recebe `null`, nunca lança. Dado corrompido nesta coluna só aconteceria
 *   por escrita externa ao Store (nunca pelo próprio `set`/`touch`, que
 *   sempre gravam ISO), mas o fail-closed evita reviver uma sessão a partir
 *   de um valor ilegível em vez de negar acesso.
 * - **`cookie.maxAge <= 0` expira a sessão imediatamente** (T-046), em vez de
 *   cair no fallback de 24h: `ttlMsFor` devolve `0` nesse caso, então
 *   `expires_at` é gravado igual ao instante da escrita e a primeira leitura
 *   seguinte (`get`) já enxerga `expires_at <= now` e apaga a linha. O
 *   fallback de `defaultTtlMs` continua reservado só para `maxAge`
 *   ausente/não numérico (cookie de sessão sem expiração explícita) — um
 *   `maxAge` explicitamente `<= 0` é um pedido deliberado do chamador
 *   (`express-session` usa isso para expirar/apagar o cookie) e não deveria
 *   ser tratado como "esqueceram de mandar".
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
    if (typeof maxAge !== 'number' || !Number.isFinite(maxAge)) {
      return this.defaultTtlMs;
    }
    return maxAge > 0 ? maxAge : 0;
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
        // Fail-closed: `expires_at` ilegível (NaN) é tratado como expirado,
        // nunca como sessão válida sem prazo.
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          // Sessão expirada (ou com expires_at corrompido): lazy-delete e
          // reporta como inexistente.
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

/**
 * Varredura de limpeza de sessões expiradas (T-034/T-046). Extraída do
 * `initDb()` (que a chama uma vez no boot) para ser exercitada diretamente em
 * teste, sem depender de subir o processo inteiro. `at` é injetável só para
 * teste — em produção o chamador usa o default (`new Date()`).
 *
 * Compara contra `expires_at` (ISO string, gravado por esta classe) usando
 * outro ISO string como parâmetro — nunca `datetime('now')` do SQLite, cujo
 * separador (' ' em vez de 'T') quebraria a comparação lexicográfica.
 *
 * Devolve o número de linhas removidas (`rowsAffected`).
 */
export async function cleanupExpiredSessions(db: Client, at: Date = new Date()): Promise<number> {
  const result = await db.execute({
    sql: 'DELETE FROM sessions WHERE expires_at <= ?',
    args: [at.toISOString()],
  });
  return result.rowsAffected;
}
