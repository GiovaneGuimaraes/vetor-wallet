# CLAUDE.md — Vetor Wallet

Carteira financeira pessoal: layers de Renda, Despesas, Poupança/Reserva, Metas e Ações da B3 (operações manuais, posição por preço médio ponderado, cotações via [brapi.dev](https://brapi.dev)).

**Detalhes por domínio vivem em `docs/decisions/` — leia só o(s) arquivo(s) do domínio que a tarefa toca (índice no fim deste arquivo).**

## Arquitetura em módulos

O app é organizado em **módulos de negócio** (Auth, Portfolio, Expenses, Savings, Billing,
Insights, BankImport…), cada um atravessando o frontend, a API REST e um ou mais packages de
lógica `packages/*-core`. Dois documentos governam isso:

- **[`docs/MODULES.md`](docs/MODULES.md)** — o que cada módulo faz e quais packages o compõem.
- **[`docs/PACKAGES.md`](docs/PACKAGES.md)** — categorias, regras de dependência e a árvore de
  decisão "onde colocar este código".

Regras que valem já hoje, antes mesmo da migração terminar:

- **Core** = dono das regras/dados de um domínio. Pode falar com o banco; **não** pode importar
  Express nem nada de `rest-api`/`web`.
- **Integration** = client de terceiro (brapi, AbacatePay, Pluggy). **Nunca toca o banco** —
  traduz o mundo externo em tipos nossos e devolve; quem persiste é o core do domínio.
- **Rota** = orquestra core + integration e traduz erro tipado em status HTTP. É o único lugar
  onde dois módulos se cruzam.
- Cada `*-core` carrega seu próprio `CLAUDE.md` com as invariantes do domínio — leia o do
  package antes de mexer nele.

> **Migração em curso.** O alvo é `packages/` = `web`, `rest-api`, `db`, `cli`, `shared` +
> os `*-core`. Hoje quase toda a lógica ainda está em `packages/server/src/api/services/`, e
> `rest-api` ainda se chama `server`. Os documentos acima marcam explicitamente o que é
> *planejado* — não procure um package assim marcado. Código **novo** já nasce no formato alvo.

## Stack e estrutura

Monorepo pnpm (`packageManager: pnpm@10.32.1`), lockfile único na raiz. TypeScript strict em tudo; sem ORM (SQL puro via `@libsql/client`); tipos compartilhados em `packages/shared` (types-only, `import type`).

```
packages/
├── shared/   # tipos TS compartilhados (Operation, Position, PortfolioSummary…)
├── db/       # @vetor-wallet/db — camada de banco (client.ts com DATABASE_URL,
│             # schema.ts/initDb, migrations.ts, sessionStore.ts, sqlErrors.ts);
│             # extraída de server/src/db em packages/*-core (T-097, Ciclo 19)
├── brapi-core/       # @vetor-wallet/brapi-core — client HTTP da brapi.dev
│                     # (cotações, tickers); extraído do server (T-098, Ciclo 19)
├── abacatepay-core/  # @vetor-wallet/abacatepay-core — client HTTP da AbacatePay
│                     # (Pix); extraído do server (T-098, Ciclo 19)
├── validation-core/  # @vetor-wallet/validation-core — isValidIsoDate,
│                     # isValidMoneyAmount, normalizeCategory; transversal, sem
│                     # módulo, sem I/O; extraído do server (T-099a, Ciclo 19)
├── server/   # Node + Express (CJS) — API REST
│   └── src/
│       └── api/   # index.ts (entry), auth/, routes/, services/, middleware/
├── web/      # Vite + React 18 (ESM) — páginas em src/routes/ com funções puras
│             # testáveis ao lado (*.test.ts); estado global em App.tsx via props
└── cli/      # jobs de coleta (tsx; alias @vetor-wallet/server/* → ../server/src/*)
```

## Comandos (sempre da raiz)

```bash
pnpm install                              # nunca npm/yarn
pnpm dev                                  # server :3001 + web :5173 (usa `&`;
                                          # no Windows prefira dois terminais)
pnpm dev:server / pnpm dev:web
pnpm build                                # server → dist/ (entry dist/api/index.js), web → dist/
pnpm --filter vetor-wallet-server test    # Vitest (server)
pnpm --filter @vetor-wallet/db test       # Vitest (db)
pnpm --filter @vetor-wallet/brapi-core test        # Vitest (brapi-core)
pnpm --filter @vetor-wallet/abacatepay-core test   # Vitest (abacatepay-core)
pnpm --filter @vetor-wallet/validation-core test   # Vitest (validation-core)
pnpm --filter vetor-wallet-web test       # Vitest (web, funções puras)
pnpm --filter vetor-wallet-cli insights:hourly [YYYY-MM-DD]
```

## Ambiente

`cp packages/<pkg>/.env.example packages/<pkg>/.env` para server, web e cli.

| Pacote | Principais variáveis |
|---|---|
| server | `PORT` (3001), `SESSION_SECRET`*, `ALLOWED_ORIGIN`*, `NODE_ENV`*, `BRAPI_TOKEN`, `DATABASE_URL` (default `process.cwd()/data/wallet.db`), `ABACATEPAY_API_KEY`, `ABACATEPAY_API_URL` (default `https://api.abacatepay.com/v2`), `ABACATEPAY_WEBHOOK_SECRET`, `BILLING_ENABLED` (default false; obrigatória true em prod com billing) — * obrigatórias em prod |
| web | `VITE_API_URL` (http://localhost:3001) |
| cli | `DATABASE_URL=file:../server/data/wallet.db` (relativo a packages/cli/), `BRAPI_TOKEN` |

O SQLite (`packages/server/data/wallet.db`) é criado no primeiro boot.

## API (base :3001, sessão via cookie `sid` exceto /api/auth/*)

| Recurso | Rotas | Notas |
|---|---|---|
| auth | POST /api/auth/register·login·logout, GET /me, PATCH /me, POST /change-password | bcrypt + express-session; troca de senha exige sessão e não a invalida (T-094) |
| wallets | GET, POST /api/wallets | carteira ÚNICA por usuário (T-050); POST recusa a 2ª |
| operations | GET, POST, DELETE /api/operations[/:id] | `walletId` do cliente é ignorado; SELL validado contra posição atual |
| portfolio | GET /api/portfolio, GET /portfolio/history?days= | cotações em tempo real; série valor × custo |
| snapshots | GET /api/snapshots/:ticker | histórico diário de preços |
| import | POST /api/import | CSV de corretora; rejeição por linha |
| import (OFX) | POST /api/import/ofx | extrato bancário OFX 1.x SGML / 2.x XML no corpo cru (`express.raw`, 1 MB); crédito → `income_entries`, débito → `expense_entries`; `external_id = ofx:<FITID>`; sempre 200 com relatório por transação (`imported`/`duplicated`/`rejected`), 400 só para o documento (T-085) |
| alerts | GET, POST, DELETE /api/alerts[/:id] | backend ativo, sem UI (T-026) |
| benchmarks | GET /api/benchmarks, GET /api/benchmarks/history?days= | CDI/Ibovespa: acumulado do período (número) e série diária p/ o gráfico (T-068) |
| tickers | GET /api/tickers | busca na brapi |
| admin | POST /api/admin/run-insights-job | requireAdmin |
| income | CRUD /api/income[/:id] | fontes fixas mensais, sem data |
| income-entries | CRUD /api/income-entries[/:id]?month= | renda avulsa datada (T-036); POST aceita `externalId` opcional — repetido responde 409 `{ duplicate: true, entry }` (T-084) |
| expenses | CRUD /api/expenses[/:id] | fixas; categoria normalizada (T-028) |
| expense-entries | CRUD /api/expense-entries[/:id]?month=, GET /summary?months=&endMonth= | variáveis datadas; `recurring: true` cria recorrência (T-035); POST aceita `externalId` opcional — repetido responde 409 `{ duplicate: true, entry }`; junto de `recurring` → 400 (T-084) |
| recurring-expenses | GET, PATCH (`{active:false}`), DELETE /api/recurring-expenses[/:id] | só encerrar (soft); criação nasce no POST de expense-entries |
| savings | CRUD /api/savings[/:id], POST /savings/transfer-to-goal | DEPOSIT/WITHDRAW/YIELD + summary; transferência = par atômico (T-041) |
| goals | CRUD /api/goals[/:id] | progresso manual OU derivado de aportes vinculados (T-024) |
| budgets | GET, POST (upsert), DELETE /api/budgets[/:id] | teto por categoria, sem vínculo com mês |
| plans | GET /api/plans | catálogo global de planos (`active = 1`); ÚNICA rota de dados sem filtro por `user_id` |
| subscriptions | POST /api/subscriptions, GET /api/subscriptions/me | assina (cria/reaproveita cobrança Pix) e lê estado de billing (T-070) |
| pix-charges | GET /api/pix-charges/:id | polling do pagamento (id LOCAL); falha do provedor → 200 + `providerUnavailable` |
| billing (dev) | POST /api/billing/simulate/:chargeId | simula pagamento; 404 em `NODE_ENV=production` |
| webhooks | POST /api/webhooks/abacatepay | SEM sessão; `express.raw` + HMAC; montado ANTES do `express.json()` |

PATCHes são parciais: campo a campo com a mesma validação da criação; corpo vazio → 400; registro de outro usuário → 404. Toda rota de dados filtra por `user_id`.

Schema completo do banco: `docs/decisions/db-schema.md` (fonte da verdade: `packages/db/src/schema.ts`).

## Convenções

- Locale pt-BR/BRL no frontend (`Intl.NumberFormat`); tema via CSS custom properties (`web/src/index.css`).
- Sem gerenciador de estado externo no web — estado em `App.tsx`, via props.
- Funções com lógica de negócio no web vivem em módulos puros em `src/routes/*.ts` com teste ao lado (componentes só renderizam).
- Helpers duplicados de propósito entre server/db e web (ex.: `normalizeCategory`, saldo livre da poupança): `shared/` é types-only. **As duas cópias mudam juntas.**
- Gráficos: SVG à mão, sem lib; cores sempre via CSS custom properties.
- Datas aceitam futuro; validação de calendário real via `isValidIsoDate` (`@vetor-wallet/validation-core`); dinheiro com no máx. 2 casas decimais (`isValidMoneyAmount`, mesmo package).

## Política de testes

Toda mudança de comportamento em server, db ou web exige teste automatizado (ou justificativa explícita). Estilo/refactor sem mudança de comportamento/docs não exigem. Padrão: `src/**/*.test.ts` em todos. Testes de rota do server e de db usam banco temporário + `DATABASE_URL` setado ANTES de `await import('@vetor-wallet/db')` (ou de um submódulo relativo dentro do próprio `packages/db`) — o client lê o env no top-level do módulo.

## Índice de decisões (docs/decisions/)

Leia o arquivo do domínio antes de mexer nele:

- **db-schema.md** — schema SQL completo, ALTERs idempotentes, índices.
- **wallets-portfolio.md** — carteira única (T-050/T-050b), validação de SELL, projeção de ganhos (T-056) + gráfico SVG (T-057b) + alocação (T-057c), falha de cotações sinalizada, AlertsPanel/CsvImport sem UI (T-026).
- **savings-goals.md** — progresso de metas manual × derivado (T-024), previsão de rendimento client-side (T-040), transferência poupança → meta (T-041).
- **expenses-budgets.md** — fixas × variáveis, recorrência lazy/idempotente (T-035), histórico mensal (T-033/T-049), orçamento por categoria (T-023/T-037), categoria normalizada (T-028), edição inline (T-031), dedupe de fetch (T-049), dedupe de importação por `external_id` (T-084), importação de extrato OFX (T-085).
- **income.md** — renda fixa × variável (T-036), sobra do mês real na Home (T-025).
- **validation-money-dates.md** — data de calendário real (T-043), máx. 2 casas decimais (T-052).
- **billing.md** — assinatura Pix AbacatePay (T-069/T-070): centavos, datas UTC no formato SQLite, ativação idempotente única, webhook com HMAC antes do `express.json()`, gating de escrita por assinatura sob `BILLING_ENABLED` (T-071).
- **sessions-auth.md** — sessões persistentes no SQLite (T-034/T-046).
- **snapshots-history.md** — coleta diária no boot + agendador (T-058a/T-061/T-063), gráfico de evolução (T-058b), preço por ação (T-060), insights horários, DATABASE_URL/Turso.
