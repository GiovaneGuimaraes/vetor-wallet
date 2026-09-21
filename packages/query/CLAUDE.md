# CLAUDE.md — @vetor-wallet/query

A função `query({ text, values })` que vai substituir o `db` injetado nos
`*-core` (passo 5 de `docs/multi-agent/plano-migracao-aws.md`). Copiado em forma
do `@ttoss/lambda-postgres-query`.

## Dois backends, o mesmo contrato

| | Quando | O que faz |
|---|---|---|
| `createPgQuery` | **fase 1**, local e CI | Pool do `pg` direto no Postgres do container |
| `createLambdaQuery` | fase 3, na nuvem | Invoca o Lambda que vive na VPC — a única coisa que abre conexão com a Aurora |

**Nenhum core sabe qual dos dois está em uso.** É essa a razão de existir o
package: o passo 5 pode acontecer inteiro na máquina do humano, contra Docker,
e a ida para a nuvem depois não toca regra de negócio nenhuma.

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
| `db.transaction()` interativa | **não existe** por proxy — ver `expenses-core` |

A última linha é dívida conhecida: `createRecurringExpenseEntry` encadeia três
escritas pelo `lastInsertRowid` da primeira. Em Postgres vira **uma instrução
só, com CTE** (`WITH ins AS (INSERT ... RETURNING id) INSERT ...`), o que aliás
dispensa a transação. É a única função do repo com esse problema.

## Convenções

Jest, teste em `tests/unit/tests/`. `createPgQuery` **não tem teste unitário**:
ele é um envelope fino do `Pool` do `pg`, e prová-lo exige um Postgres no ar —
é teste de integração, e virá junto do primeiro core migrado.
