# CLAUDE.md — @vetor-wallet/fixed-income-core

Renda Fixa **manual** do Vetor Wallet: posições de caixinha, CDB, LCI/LCA,
Tesouro, debênture e CRI/CRA. Categoria **Core**, módulo **FixedIncome** (ver
`docs/MODULES.md`/`docs/PACKAGES.md`). Dono da tabela `fixed_income_positions`.
Nasceu na **T-091c/d, fatia c1** (2026-10-16), primeira de sete fatias do
dashboard de Investimentos (Ações + Renda Fixa, manual + Pluggy).

## Por que é um core próprio

Decisões do humano, não reabrir:

- **"Caixinha é Renda Fixa, irmã de Ações"** (#165). Renda Fixa não entra
  dentro de Ações.
- **Não é `portfolio-core`.** Regra dura: os números da B3 (preço médio, P&L,
  série valor × custo) não mudam por causa de Renda Fixa. Um diff desta
  frente que toque `portfolio-core`/`operations-core` é reprovado.
- **Não é `savings-core`.** Poupança é **livro-razão** (cada linha é um
  lançamento e o saldo é derivado); aqui cada linha é uma **posição** — o que
  foi aplicado, quando, com que taxa, e quanto vale hoje segundo o usuário.

## O que este core NÃO faz

**Não estima rendimento.** O valor exibido de uma posição é
`current_value ?? invested_amount` — o saldo que o usuário informou numa data,
ou o valor aplicado. `rate_type`/`rate` são guardados como informação, mas
nada aqui projeta CDI/IPCA/pré: isso é cálculo financeiro real (dias úteis,
IR, IOF, marcação a mercado) que cruza com o `insights-core`, e fica para
tarefa futura se o humano pedir. Não acrescente "rendimento estimado" aqui
sem essa tarefa.

**Não valida entrada de usuário.** Mesma convenção de `alerts-core` e
`operations-core`: a rota `packages/rest-api/src/api/routes/fixedIncome.ts`
valida e o core recebe o corpo já limpo. As regras de lá:

- `investedAmount` número finito `> 0` com no máx. 2 casas (`isValidMoneyAmount`);
- `currentValue` `>= 0` com no máx. 2 casas, quando presente;
- todas as datas por `isValidIsoDate` (calendário real);
- `maturityDate >= investedAt` quando há vencimento — no PATCH, contra o
  estado FINAL (o corpo pode trazer só um dos lados; é para isso que existe
  `getFixedIncomePosition`);
- `currentValue` e `currentValueDate` vêm **juntos ou nenhum** (no PATCH,
  `null` nos dois limpa o saldo informado);
- `rate` finito (0 é válido); `kind`/`rateType` dentro das listas deste core.

**Sem `source`/`external_id` nesta fatia.** A integração com a Pluggy (fatias
d2/d3) acrescenta as colunas; até lá toda posição é manual.

## Schema

```sql
CREATE TABLE IF NOT EXISTS fixed_income_positions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  name               TEXT    NOT NULL,
  kind               TEXT    NOT NULL CHECK(kind IN
                       ('CAIXINHA','CDB','LCI','LCA','TESOURO','DEBENTURE','CRI_CRA','OUTRO')),
  institution        TEXT    NOT NULL DEFAULT '',
  invested_amount    REAL    NOT NULL,
  invested_at        TEXT    NOT NULL,   -- YYYY-MM-DD
  maturity_date      TEXT,               -- NULL = liquidez diária / sem vencimento
  rate_type          TEXT    NOT NULL CHECK(rate_type IN ('PRE','CDI','IPCA','SELIC')),
  rate               REAL    NOT NULL,   -- PRE: % a.a. | CDI: % do CDI | IPCA/SELIC: spread
  current_value      REAL,
  current_value_date TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fixed_income_positions_user
  ON fixed_income_positions(user_id, invested_at);
```

Fonte da verdade: `packages/db/src/schema.ts` (SQLite) e
`packages/postgresdb/src/models/FixedIncomePosition.ts` (Postgres — `kind` e
`rate_type` viram `ENUM`, dinheiro `NUMERIC(14,2)`, `rate` `DOUBLE PRECISION`
porque percentual não é dinheiro). **`FIXED_INCOME_KINDS`, o CHECK e o ENUM
mudam juntos**; idem `FIXED_INCOME_RATE_TYPES`.

## Estrutura

```
src/
├── FIXED_INCOME_KINDS.ts        # vocabulário de kind + isFixedIncomeKind
├── FIXED_INCOME_RATE_TYPES.ts   # indexadores + isFixedIncomeRateType
├── toCents.ts                   # PURO: cópia do savings-core (regra 6)
├── summariseFixedIncome.ts      # PURO: total aplicado × total atual
├── listFixedIncomePositions.ts  # query injetado
├── getFixedIncomePosition.ts    # query injetado; null = 404 da rota
├── createFixedIncomePosition.ts # query injetado; RETURNING id
├── updateFixedIncomePosition.ts # query injetado; null = 404 da rota
├── deleteFixedIncomePosition.ts # query injetado; false = 404 da rota
└── index.ts                     # barrel
tests/unit/                      # Jest, 1 teste por arquivo, threshold 100%
```

## Convenções (formato-alvo, molde `savings-core`)

- **`query: Query` injetado** (`@vetor-wallet/query`, convenção da T-113) —
  este core já nasce sem `db`. A rota passa `createSqliteQuery(db)`; quando o
  Postgres entrar, troca para `createPgQuery(...)` sem tocar aqui.
- Placeholders `$1, $2, ...` **sem repetir índice** na mesma query — o
  `createSqliteQuery` traduz por ordem de aparição.
- Toda leitura e escrita filtra por `user_id`, inclusive o re-SELECT depois
  do INSERT e o próprio `UPDATE` (não só a checagem de existência).
- Dinheiro somado em **centavos inteiros** (`toCents`) e devolvido em reais,
  como o resto da API.
- `toCents` é **duplicado** do `savings-core` de propósito: regra 6 de
  `docs/PACKAGES.md` (core não depende de core de outro módulo).

```bash
pnpm --filter @vetor-wallet/fixed-income-core test   # Jest, cobertura 100%
```
