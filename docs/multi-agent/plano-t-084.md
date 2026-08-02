# Plano de implementação — T-084 (spike Opus, 2026-08-02)

> Produzido por spike de design (agente Plan em Opus) durante o Ciclo 16. O executor da T-084 deve receber este plano NA ÍNTEGRA no prompt e segui-lo (desvios só com justificativa registrada). Um executor Opus chegou a ser iniciado com este plano mas foi interrompido pelo humano antes de qualquer commit — a tarefa recomeça do zero a partir da `main`.

## Contexto verificado (o que já existe e define o padrão)

- **ALTERs idempotentes NÃO vivem em `migrations.ts`** (esse arquivo só tem migrações de *dados*: `normalizeExistingCategories`, `seedPlans`). O padrão real está em `packages/server/src/db/schema.ts`, linhas ~335-359: um array de strings SQL percorrido com `try { await db.execute(sql) } catch { /* Column already exists */ }`. Sem PRAGMA, sem checagem prévia. **Siga esse array** (o BACKLOG diz "migrations.ts" por imprecisão; o `db-schema.md` diz corretamente "`initDb()` via ALTER idempotente").
- Índices auxiliares criados **depois** do loop de ALTER (ex.: `idx_savings_entries_goal`, linha ~361) — obrigatório aqui, pois o índice depende da coluna nova.
- **`isUniqueViolation(err)` já existe e é testado**: `packages/server/src/api/services/recurringExpenses.ts:60-67` (checa `code === 'SQLITE_CONSTRAINT_UNIQUE' | 'SQLITE_CONSTRAINT_PRIMARYKEY'`, com fallback por regex `/UNIQUE constraint failed/i`). É exatamente o formato de erro do `@libsql/client`. Não reimplemente.
- Precedente de import cruzado entre rotas: `incomeEntries.ts:11` importa `currentMonth` de `expenseEntries.ts`.

## 1. Arquivos a tocar

| Arquivo | Mudança |
|---|---|
| `packages/server/src/db/schema.ts` | 2 ALTERs no array existente + 2 `CREATE UNIQUE INDEX ... WHERE` após o loop, com comentário explicando o índice parcial |
| `packages/server/src/api/services/sqlErrors.ts` **(novo)** | move `isUniqueViolation` para módulo neutro (o dedupe de renda não deve importar de `recurringExpenses`) |
| `packages/server/src/api/services/recurringExpenses.ts` | remove o corpo de `isUniqueViolation` e faz `export { isUniqueViolation } from './sqlErrors';` — mantém `recurringExpenses.test.ts` verde sem tocá-lo |
| `packages/server/src/api/services/externalId.ts` **(novo)** | `validateExternalId(raw)` puro (retorna `{ ok, value } \| { ok: false, error }`) + `insertEntryWithExternalId(...)` (a operação idempotente reusável, consumida por T-085/T-087) |
| `packages/server/src/api/routes/incomeEntries.ts` | POST aceita `externalId`; grava coluna; trata duplicata |
| `packages/server/src/api/routes/expenseEntries.ts` | idem + regra `recurring` × `externalId` |
| `packages/shared/src/index.ts` | `external_id: string \| null` em `IncomeEntry`/`ExpenseEntry`; `externalId?: string` em `NewIncomeEntry`/`NewExpenseEntry` |
| `packages/server/src/db/schema.test.ts` | testes de coluna + índice + `initDb()` 2× |
| `packages/server/src/api/routes/incomeEntries.test.ts` / `expenseEntries.test.ts` | casos de rota |
| `packages/server/src/api/services/externalId.test.ts` **(novo)** | validação pura |
| `docs/decisions/db-schema.md` | comentários de ALTER idempotente nas duas tabelas (padrão dos blocos `-- ALTER idempotente:` já existentes) |
| `docs/decisions/expenses-budgets.md` e `income.md` | seção curta "Dedupe de importação (T-084)" com a decisão do 409 |
| `CLAUDE.md` (raiz) | uma linha na tabela de API: `externalId` opcional + 409 nas duas rotas |

**Não** mexer no PATCH (não aceita `externalId` — mesma decisão de `transfer_group`, que é etiqueta de procedência e o PATCH ignora).

## 2. SQL exato

No array de ALTERs de `schema.ts` (após a linha do `transfer_group`), dentro do mesmo `for`/`try`/`catch`:

```ts
// T-084: identificador da transação no sistema de ORIGEM (FITID do OFX,
// id da transação Pluggy). NULL = lançamento criado à mão pela UI — é a
// esmagadora maioria das linhas, por isso o índice de unicidade é PARCIAL.
'ALTER TABLE income_entries ADD COLUMN external_id TEXT',
'ALTER TABLE expense_entries ADD COLUMN external_id TEXT',
```

Sem `NOT NULL`, sem `DEFAULT` — `ALTER TABLE ADD COLUMN` no SQLite exige default para `NOT NULL`, e a coluna é nullable por design.

Depois do loop (junto de `idx_savings_entries_goal`):

```ts
// Índice único PARCIAL: dedupe de importação por usuário. O `WHERE
// external_id IS NOT NULL` não é só otimização — mantém o índice restrito
// às linhas importadas (as manuais, maioria, ficam fora) e deixa a
// intenção explícita, já que em SQLite NULLs nunca colidem num UNIQUE.
// O par é (user_id, external_id): dois usuários podem importar o MESMO
// FITID (mesmo extrato, contas diferentes) sem conflito.
await db.execute(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_income_entries_user_external
   ON income_entries(user_id, external_id) WHERE external_id IS NOT NULL`,
);
await db.execute(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_entries_user_external
   ON expense_entries(user_id, external_id) WHERE external_id IS NOT NULL`,
);
```

Idempotência do conjunto: 1º boot → ALTER passa, índice criado; 2º boot → ALTER lança `duplicate column name`, é engolido pelo `catch`, `IF NOT EXISTS` do índice não faz nada. Ordem importa: ALTER **antes** do CREATE INDEX, senão o 1º boot falha com `no such column`.

## 3. Detecção de duplicata — recomendação: **INSERT primeiro, captura da violação**

```ts
try {
  const insert = await db.execute({ sql: 'INSERT INTO ...', args: [...] });
  return { status: 'created', id: Number(insert.lastInsertRowid ?? 0) };
} catch (err) {
  if (!isUniqueViolation(err)) throw err;   // qualquer outro erro sobe → 500
  const existing = await db.execute({
    sql: 'SELECT * FROM <table> WHERE user_id = ? AND external_id = ?',
    args: [userId, externalId],
  });
  return { status: 'duplicate', row: existing.rows[0] };
}
```

Justificativa:
- **SELECT-antes é TOCTOU**: duas requests em paralelo passariam as duas pela checagem e a segunda estouraria o UNIQUE como 500. Mesmo raciocínio já documentado na T-035 ("a idempotência é do banco, não do código").
- Custo: caminho feliz faz **1** query; só a duplicata paga o SELECT extra.
- Borda: se `existing.rows[0]` vier `undefined` (linha apagada entre INSERT e SELECT), responda 409 com `entry: null`; sem retry.

`insertEntryWithExternalId` vive em `services/externalId.ts`, parametrizada pela tabela (`'income_entries' | 'expense_entries'` — union literal, nunca string interpolada de input), devolve `{ status: 'created' | 'duplicate', row }`. É essa função que T-085 e T-087 chamam direto (o job Pluggy roda no cli via alias `@vetor-wallet/server/*` e **não** passa por HTTP) — ela é o contrato real desses consumidores.

## 4. Formato da resposta de duplicata — recomendação: **409**

```
409 { "error": "Lançamento já importado (externalId duplicado)", "duplicate": true, "entry": { ...linha existente... } }
```

- T-085/T-087 consomem a função, não a rota — o 409 só atinge o POST unitário, onde falhar alto é o correto (200+flag seria ignorável e enganaria clientes que fazem optimistic append; 201 mentiria).
- Corpo com `entry` dá o `id` do registro existente sem busca extra. Convenção `{ error: string }` mantida, apenas estendida.
- Documentar: **duplicata unitária = 409; duplicata em lote (endpoint OFX da T-085) = linha do relatório com 200**.

## 5. Validação de `externalId`

Função pura `validateExternalId(raw: unknown)`, testada, usada pelas duas rotas:

- `undefined` **ou `null`** → ausente, grava `NULL` (serializadores emitem `null` para opcional vazio).
- Não-string → `400 'externalId deve ser texto'`.
- **`trim()`** antes de tudo; o valor trimado é o gravado e comparado.
- Vazio após trim → `400 'externalId não pode ser vazio'` (**não** tratar como ausente — string vazia de importador é bug e engoli-la desligaria o dedupe).
- Máx. **255** chars → 400 acima (FITID pela spec OFX ≤ 255; ids Pluggy são UUIDs).
- Sem restrição de charset; sem normalização de caixa.
- Extra no POST de despesas: `recurring === true` + `externalId` → `400 'externalId não é aceito em lançamento recorrente'` (nenhum importador cria recorrência; não misturar os dois mecanismos de idempotência).
- Ordem de validação: `externalId` depois de description/amount/date, antes do INSERT.

## 6. Casos de teste

**`db/schema.test.ts`** (`describe('T-084 — external_id')`):
1. Coluna `external_id` nas duas tabelas (`PRAGMA table_info`).
2. Índices no `sqlite_master` com `user_id`, `external_id` e `WHERE external_id IS NOT NULL` no `sql`.
3. `await initDb(); await initDb();` sem erro, índices com `COUNT(*) = 1`.

**`routes/incomeEntries.test.ts`** e **`routes/expenseEntries.test.ts`** (espelhados; usar os `agentA`/`agentB` já registrados):
4. POST sem `externalId` → 201 inalterado, `external_id` NULL.
5. POST com `externalId` novo → 201 com o valor gravado.
6. Repetido (mesmo user) → 409, `duplicate === true`, `entry.id` da 1ª criação; `GET ?month=` confirma 1 lançamento.
7. Duplicata com conteúdo diferente → 409, nada atualizado (dedupe por id externo, não por conteúdo; upsert fora de escopo).
8. Mesmo `externalId` em users diferentes → 201 (isolamento).
9. `''` / `'   '` / `123` / 256 chars → 400; 255 chars → 201.
10. `' FIT-1 '` seguido de `'FIT-1'` → 409 (prova o trim).
11. `externalId: null` → 201.
12. (despesas) `recurring: true` + `externalId` → 400; `recurring: true` sem → 201 inalterado.
13. PATCH com `externalId` → ignorado (não entra no SET); corpo só com `externalId` → 400 de corpo vazio.

**`services/externalId.test.ts`**: tabela de casos da validação pura.

Padrão obrigatório dos testes com banco: `DATABASE_URL` no top-level do módulo ANTES de `await import('../../db')`; imports de db/rotas no `beforeAll`; app express montado à mão; usuários via register em `request.agent`.

## 7. Riscos e casos de borda

- **Ordem ALTER → INDEX** no `initDb()`: inverter quebra o primeiro boot.
- **`requireActiveSubscription`** já montado nos dois routers: a T-085 (rota HTTP) herda o gate; a T-087 (cli, chama a função) escapa dele — coerente, avisar o executor da T-085.
- **`SELECT *`** passa a devolver `external_id` na listagem — aceitável (fora de escopo é a UI, não filtrar colunas); tipos do `shared` DEVEM ganhar o campo.
- Bases legadas ficam com NULL; índice parcial as ignora — boot não falha por colisão.
- Turso: índice parcial é SQLite padrão; `isUniqueViolation` cobre divergência de driver pelo fallback de mensagem.
- **DELETE libera a chave e reimport recria a linha** — assimetria intencional com a T-035 (reimportar extrato restaura apagado por engano). DOCUMENTAR, senão parece bug.
- **Namespace no `external_id`** (`ofx:<FITID>` / `pluggy:<id>`): adotar por convenção na T-085/T-087 (anotar no doc; sem validar formato agora) — evita colisão FITID × id Pluggy da mesma transação.
