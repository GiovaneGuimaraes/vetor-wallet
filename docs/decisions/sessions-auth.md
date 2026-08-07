# Decisões: sessões e autenticação

> **Nota (T-099c).** As regras de credenciais, perfil e papéis foram para
> [`packages/auth-core/CLAUDE.md`](../../packages/auth-core/CLAUDE.md). O
> `SqliteSessionStore` vive em `packages/db` desde a T-097 (ver
> `packages/db/CLAUDE.md`). Este documento cobre só a persistência de sessão.

### Sessões persistem no restart (T-034)
`express-session` usa `SqliteSessionStore` (`packages/db/src/sessionStore.ts`), uma implementação da interface `Store` sobre o mesmo `@libsql/client`/arquivo SQLite do app — não mais o `MemoryStore` padrão. Sessões sobrevivem a restart do server porque ficam gravadas na tabela `sessions` (`sid` PK, `data` TEXT JSON, `expires_at`; criada em `initDb()`, idempotente como as demais).

Pontos de projeto:

- **TTL** é derivado de `cookie.maxAge` (ms) — a mesma configuração que já existia (`7 * 24 * 60 * 60 * 1000` em `index.ts`). Fallback de 24h **apenas** quando `maxAge` está ausente/não numérico; `maxAge <= 0` (finito) expira a sessão imediatamente (T-046), tanto no `set` quanto no `touch` — a linha já-morta é gravada e some via lazy-delete/varredura (escolha consciente, coerente com o modelo do Store).
- **Fail-closed**: `expires_at` corrompido/não-ISO no `get` é tratado como sessão expirada (retorna `null` e apaga a linha), nunca revive a sessão nem lança síncrono (T-046). A varredura de boot vive em `cleanupExpiredSessions` (exportada e testada diretamente).
- **Expiração**: `get` faz lazy-delete — uma sessão com `expires_at` no passado retorna `null` e a linha é apagada na mesma chamada. Além disso, `initDb()` roda uma varredura de limpeza no boot (`DELETE FROM sessions WHERE expires_at <= <ISO agora>`) para não acumular sessões expiradas de execuções antigas que nunca mais serão lidas.
- **`touch`** (usado por `rolling`/renovação) atualiza só `expires_at`, sem reescrever `data`.
- **Callbacks nunca lançam síncrono** — todo método do Store é promise-based internamente e delega erro ao callback (`cb(err)`); um throw síncrono aqui derrubaria o server, já que o `express-session` não envolve as chamadas em `try/catch`.
- `expires_at` é gravado como ISO string (UTC) e a varredura de boot compara contra um parâmetro também ISO — nunca contra `datetime('now')` do SQLite (formatos com separador `T` vs espaço não comparam de forma lexicográfica consistente entre si).
- Sem dependência nova — a interface `Store` do `express-session` já era exposta pelo próprio pacote (`import { Store } from 'express-session'`).
- Continua valendo para produção multi-instância/Turso: como o driver já é `@libsql/client`, apontar `DATABASE_URL` para Turso persiste sessões do mesmo jeito, sem trocar nada no Store. Redis/Cognito seguem fora de escopo (seriam necessários só para requisitos que o SQLite não cobre, como sessão compartilhada entre múltiplos processos/regiões).

