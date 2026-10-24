# CLAUDE.md — @vetor-wallet/query

A função `query({ text, values })` que vai substituir o `db` injetado nos
`*-core` (passo 5 de `docs/multi-agent/plano-migracao-aws.md`). Copiado em forma
do `@ttoss/lambda-postgres-query`.

## Três backends, o mesmo contrato

| | Quando | O que faz |
|---|---|---|
| `createSqliteQuery` | **hoje**, enquanto o app roda em SQLite | Envelopa o `Db` (libSQL) e traduz `$N` → `?` |
| `createPgQuery` | **fase 1**, local e CI | Pool do `pg` direto no Postgres do container |
| `createLambdaQuery` | fase 3, na nuvem | Invoca o Lambda que vive na VPC — a única coisa que abre conexão com a Aurora |

**Nenhum core sabe qual deles está em uso.** É essa a razão de existir o
package: o passo 5 pode acontecer inteiro na máquina do humano, contra Docker,
e a ida para a nuvem depois não toca regra de negócio nenhuma.

### `createSqliteQuery` mora aqui desde a T-114

Nasceu em `rest-api/src/api/sqliteQuery.ts` (T-113) como ponte das rotas, e
veio para cá na última fatia da T-114 (`portfolio-core`): o `auth-core` chama
`getOrCreateDefaultWallet` — que passou a falar `Query` — e **core nenhum
importa do `rest-api`** (inverteria a dependência). Morando aqui, ele é o
terceiro backend como os outros dois, acessível a qualquer chamador: rota, boot
(`catchUpIfNeeded` no `rest-api/src/api/index.ts`) ou core (`auth-core`).

- Por isso este package depende de `@vetor-wallet/db` — **só pelo tipo `Db`**
  (e `@libsql/client` só como devDependency, pelo tipo `InStatement`). Importar
  o barrel não abre conexão; quem passa o `db` é o chamador.
- Tradução por **ordem de aparição**: um core migrado nunca repete o mesmo `$N`
  numa query — valor que entra duas vezes vai duas vezes em `values` (ver
  `portfolio-core.getPreviousCloseSnapshots`).
- `rowCount` vem de `rowsAffected`; `RETURNING id` funciona porque o SQLite ≥
  3.35 aceita a cláusula e o libSQL devolve as linhas em `rows`.
- Some quando o passo 6 ligar o Postgres: a troca é `createSqliteQuery(db)` →
  `createPgQuery(...)` em quem constrói o client, sem tocar core nenhum.

## Onde DIVERGE da referência, e por quê

O `query` do ttoss converte as chaves das linhas para **camelCase**. Aqui
**não**. A API do Vetor Wallet devolve `user_id`, `created_at` e `external_id`
hoje; o casing inconsistente é débito com tarefa própria no `BACKLOG.md`.
Converter junto com o banco quebraria o web inteiro no meio da migração e
esconderia uma mudança de contrato dentro de um passo que promete não mudar
contrato nenhum.

O `createLambdaQuery` também **recebe o invoker por injeção** em vez de importar
`@aws-sdk/client-lambda`: o teste não precisa de AWS, a fase 1 roda sem SDK
instalado, e trocar de SDK um dia não toca este arquivo.

## `isUniqueViolation` é a armadilha silenciosa do passo 5

No SQLite é `SQLITE_CONSTRAINT_UNIQUE`; no Postgres é **`SQLSTATE 23505`**.
Duas coisas dependem de reconhecê-lo, e **nenhuma delas falha alto** quando
para de funcionar:

1. a **dedupe de importação** (T-084) — OFX/Pluggy reimportado vira 500 em vez
   de 409, e o usuário vê erro onde deveria ver "já importado";
2. a **corrida de materialização de recorrência** (T-035) — o perdedor da
   corrida deixa de ser reconhecido e a request inteira falha.

Não quebra build, não quebra tipo. **É a primeira função a escrever no passo 5,
antes de traduzir qualquer query** — e por isso ela já existe aqui, testada,
antes de o primeiro core migrar.

## O formato das linhas NÃO muda

`pinPgTypeParsers()` faz o `pg` devolver **texto** para `DATE`, `TIMESTAMP` e
`TIMESTAMPTZ`. Sem isso:

- `DATE` viraria `Date` do JS, e `JSON.stringify` o entregaria como
  `2026-09-20T00:00:00.000Z` — o app inteiro fala `YYYY-MM-DD`;
- `created_at` deixaria de ser string.

Preservar o formato é o que permite os **440 testes de rota continuarem
valendo** durante a troca de banco. `NUMERIC` já volta como string por padrão do
`pg` (para não perder precisão), e isso também é o que queremos: quem converte é
o core, que soma em centavos inteiros.

## O que muda na tradução de cada query (passo 5)

| SQLite (`db`) | Postgres (`query`) |
|---|---|
| `{ sql, args }` | `{ text, values }` |
| `?` | `$1`, `$2` |
| `lastInsertRowid` | `RETURNING id` |
| `rowsAffected` | `rowCount` |
| `SQLITE_CONSTRAINT_UNIQUE` | `23505` |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` (roda nos dois; ver `portfolio-core.saveSnapshot`) |
| `db.transaction()` interativa | **não existe** por proxy — ver `expenses-core` |

A última linha é dívida conhecida: `createRecurringExpenseEntry` (ainda não
migrado) encadeia três escritas pelo `lastInsertRowid` da primeira. Em Postgres
vira **uma instrução só, com CTE** (`WITH ins AS (INSERT ... RETURNING id)
INSERT ...`), o que aliás dispensa a transação. **Não é mais a única função com
esse problema**: `subscription-core.markChargePaidAndActivate` (T-114) perdeu a
mesma garantia ao migrar, virando duas chamadas sequenciais — a idempotência de
cada passo individual (`status <> 'PAID'`, `ON CONFLICT`) cobre o caso comum,
mas a janela de "processo morreu entre as duas" ficou sem rede; decisão
registrada em `subscription-core/CLAUDE.md` e `docs/multi-agent/TODO-HUMANO.md`.

## Convenções

Jest, teste em `tests/unit/tests/`. `createSqliteQuery` tem teste com `Db`
mockado (tradução de placeholder, `args`, `rowCount`) desde a T-114 — antes só
era coberto indiretamente pelos testes de rota. `createPgQuery` **não tem teste unitário**:
ele é um envelope fino do `Pool` do `pg`, e prová-lo exige um Postgres no ar —
é teste de integração, e virá junto do primeiro core migrado.
