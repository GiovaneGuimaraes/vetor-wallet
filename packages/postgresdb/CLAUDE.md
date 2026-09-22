# CLAUDE.md — @vetor-wallet/postgresdb

O **schema do Postgres**, declarativo, para a migração da fase 1
(`docs/multi-agent/plano-migracao-aws.md`, passo 4). Copiado em forma do
`@ttoss/postgresdb`, que é o que a referência do humano roda em produção:
modelos `sequelize-typescript` + `initialize()` lendo `DATABASE_*`.

**Este package não atende request.** Quem fala com o banco em runtime é
`@vetor-wallet/query`. Aqui mora DDL e ferramenta: `db:sync`, o container local
e, mais adiante, a carga dos dados.

## Como rodar local

```bash
pnpm --filter @vetor-wallet/postgresdb db:up      # sobe o Postgres em :5433
pnpm --filter @vetor-wallet/postgresdb db:sync    # aplica o schema
pnpm --filter @vetor-wallet/postgresdb db:down    # derruba e apaga o volume
```

A porta é **5433**, não 5432: a padrão costuma já estar ocupada por outro
Postgres, e descobrir isso por um erro de autenticação confuso custa mais que
um número diferente.

## O que NÃO atravessa a migração, de propósito

- **`users.password_hash`** — morta desde a T-106 (nada lê, nada escreve). Não
  criá-la no Postgres é o `DROP` acontecendo de graça, no único momento em que
  ele não custa uma migração destrutiva.
- **`hourly_quote_insights`** — a tabela sem leitor que a T-109a deixou parada.
  Mesmo raciocínio.
- **`goals` e `savings_entries.goal_id`** — já apagadas no SQLite (T-091b2).

**O dump anterior à carga continua obrigatório** (passo 8): ele é a única cópia
do que fica para trás. "Não criar no destino" não é o mesmo que "não ter tido".

## Decisões do schema

- **Dinheiro é `NUMERIC(14,2)`** (`src/money.ts`). Hoje são 17 colunas em `REAL`
  — dívida conhecida, e a razão de os cores somarem em centavos inteiros antes
  de comparar. A conferência de somas antes/depois da carga tem diferença
  esperada **zero**; se aparecer diferença, ela já existia.
- **`price_cents` e `amount_cents` continuam `INTEGER`.** Inteiro é exato por
  construção, e trocar a unidade junto com o banco seriam duas mudanças no
  mesmo passo.
- **Data do usuário é `DATE`; chave de mês (`YYYY-MM`) continua `TEXT`.** Mês
  não é data — `start_month` e `recurring_expense_months.month` são chaves.
- **`CHECK(... IN ...)` vira `ENUM`.** É o tipo honesto no Postgres e recusa
  valor inválido no banco, não só na rota.
- **`sessions` está modelada, mas só nasce se a decisão 3 for "trocar o
  store"** (§6.1 do plano). Ter o modelo sem usar não custa nada; descobrir na
  hora que ele falta custaria um deploy.

## A armadilha que já mordeu aqui

**`timestamps: true` é o default do Sequelize** e adiciona `updated_at`
sozinho. Na primeira versão deste package isso criou a coluna em **14 tabelas
que não a têm** no SQLite — schema silenciosamente diferente do que a migração
de dados espera. O teste de atributos passava; **só o DDL gerado mostrou**.

Por isso existe `tests/unit/tests/ddl.test.ts`: ele gera o `CREATE TABLE` de
cada modelo **sem conectar em banco nenhum** e afirma o que deve e o que não
deve aparecer. É o teste a rodar primeiro ao mexer em qualquer modelo.

## Provado contra Postgres real (2026-09-22)

`db:up` + `db:sync` rodaram contra o Postgres 16 do `docker-compose.yml` (não
mock): as 21 tabelas nasceram, `ENUM` e `NUMERIC(14,2)` foram aceitos sem
retrabalho de ordem de criação. **Um bug real apareceu, e só apareceu aqui**:
`@Index('nome')` em nível de propriedade (usado em `ExpenseEntry`,
`IncomeEntry`, `PluggyItem`, `PixCharge`, `RecurringExpense`, `QuoteSnapshot`,
`Session`) ignora `underscored: true` e gera `CREATE INDEX` com o nome do
atributo em camelCase (`"userId"`) em vez da coluna real (`user_id`) — o
Postgres recusa com `column "userId" does not exist`. O `ddl.test.ts` não pega
isso porque ele testa o `CREATE TABLE`, não o `CREATE INDEX` de composto. O
`CategoryBudget` já usava o padrão certo (`@Table({ indexes: [...] })` com
nomes de coluna explícitos em snake_case) — os outros sete modelos foram
alinhados a ele. **Regra daqui pra frente**: índice composto ou multi-atributo
sempre por `@Table({ indexes: [...] })`, nunca pelo decorator `@Index` na
propriedade.

## Índices que o `sync` NÃO gera

Índice de **expressão** e índice **parcial** não saem do `sync` e entram por
migração explícita:

- `UNIQUE (ticker, (captured_at::date))` em `quote_snapshots` — **sem ele não
  há idempotência da coleta diária**;
- `UNIQUE (user_id, external_id) WHERE external_id IS NOT NULL` em
  `income_entries` e `expense_entries` — a dedupe de importação (T-084);
- `UNIQUE (cognito_sub) WHERE cognito_sub IS NOT NULL` em `users`.

No Postgres, `UNIQUE` comum já ignora `NULL`, então o índice parcial é
otimização (não indexa linha manual), não correção — **menos** no caso do
`quote_snapshots`, que é expressão e é correção.

## Convenções

Jest, como o resto dos cores. **Exceção ao formato**: a cobertura não é 100% por
threshold — `initialize.ts` e `sync.ts` abrem conexão, e prová-los exige banco
no ar. O que a suíte cobre são as decisões declarativas, que é onde o erro passa
despercebido.
