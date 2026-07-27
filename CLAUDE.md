# CLAUDE.md — Vetor Wallet

Carteira financeira pessoal: layers de Renda, Despesas, Poupança/Reserva, Metas e Ações da B3 (operações manuais, posição por preço médio ponderado, cotações via [brapi.dev](https://brapi.dev)).

**Detalhes por domínio vivem em `docs/decisions/` — leia só o(s) arquivo(s) do domínio que a tarefa toca (índice no fim deste arquivo).**

## Stack e estrutura

Monorepo pnpm (`packageManager: pnpm@10.32.1`), lockfile único na raiz. TypeScript strict em tudo; sem ORM (SQL puro via `@libsql/client`); tipos compartilhados em `packages/shared` (types-only, `import type`).

```
packages/
├── shared/   # tipos TS compartilhados (Operation, Position, PortfolioSummary…)
├── server/   # Node + Express (CJS) — API REST
│   └── src/
│       ├── db/    # client.ts (libsql + DATABASE_URL), schema.ts (initDb),
│       │          # migrations.ts, sessionStore.ts, index.ts (barrel)
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
pnpm --filter vetor-wallet-web test       # Vitest (web, funções puras)
pnpm --filter vetor-wallet-cli insights:hourly [YYYY-MM-DD]
```

## Ambiente

`cp packages/<pkg>/.env.example packages/<pkg>/.env` para server, web e cli.

| Pacote | Principais variáveis |
|---|---|
| server | `PORT` (3001), `SESSION_SECRET`*, `ALLOWED_ORIGIN`*, `NODE_ENV`*, `BRAPI_TOKEN`, `DATABASE_URL` (default `process.cwd()/data/wallet.db`) — * obrigatórias em prod |
| web | `VITE_API_URL` (http://localhost:3001) |
| cli | `DATABASE_URL=file:../server/data/wallet.db` (relativo a packages/cli/), `BRAPI_TOKEN` |

O SQLite (`packages/server/data/wallet.db`) é criado no primeiro boot.

## API (base :3001, sessão via cookie `sid` exceto /api/auth/*)

| Recurso | Rotas | Notas |
|---|---|---|
| auth | POST /api/auth/register·login·logout, GET /me | bcrypt + express-session |
| wallets | GET, POST /api/wallets | carteira ÚNICA por usuário (T-050); POST recusa a 2ª |
| operations | GET, POST, DELETE /api/operations[/:id] | `walletId` do cliente é ignorado; SELL validado contra posição atual |
| portfolio | GET /api/portfolio, GET /portfolio/history?days= | cotações em tempo real; série valor × custo |
| snapshots | GET /api/snapshots/:ticker | histórico diário de preços |
| import | POST /api/import | CSV de corretora; rejeição por linha |
| alerts | GET, POST, DELETE /api/alerts[/:id] | backend ativo, sem UI (T-026) |
| benchmarks | GET /api/benchmarks | CDI/Ibovespa |
| tickers | GET /api/tickers | busca na brapi |
| admin | POST /api/admin/run-insights-job | requireAdmin |
| income | CRUD /api/income[/:id] | fontes fixas mensais, sem data |
| income-entries | CRUD /api/income-entries[/:id]?month= | renda avulsa datada (T-036) |
| expenses | CRUD /api/expenses[/:id] | fixas; categoria normalizada (T-028) |
| expense-entries | CRUD /api/expense-entries[/:id]?month=, GET /summary?months=&endMonth= | variáveis datadas; `recurring: true` cria recorrência (T-035) |
| recurring-expenses | GET, PATCH (`{active:false}`), DELETE /api/recurring-expenses[/:id] | só encerrar (soft); criação nasce no POST de expense-entries |
| savings | CRUD /api/savings[/:id], POST /savings/transfer-to-goal | DEPOSIT/WITHDRAW/YIELD + summary; transferência = par atômico (T-041) |
| goals | CRUD /api/goals[/:id] | progresso manual OU derivado de aportes vinculados (T-024) |
| budgets | GET, POST (upsert), DELETE /api/budgets[/:id] | teto por categoria, sem vínculo com mês |

PATCHes são parciais: campo a campo com a mesma validação da criação; corpo vazio → 400; registro de outro usuário → 404. Toda rota de dados filtra por `user_id`.

Schema completo do banco: `docs/decisions/db-schema.md` (fonte da verdade: `packages/server/src/db/schema.ts`).

## Convenções

- Locale pt-BR/BRL no frontend (`Intl.NumberFormat`); tema via CSS custom properties (`web/src/index.css`).
- Sem gerenciador de estado externo no web — estado em `App.tsx`, via props.
- Funções com lógica de negócio no web vivem em módulos puros em `src/routes/*.ts` com teste ao lado (componentes só renderizam).
- Helpers duplicados de propósito entre server e web (ex.: `normalizeCategory`, saldo livre da poupança): `shared/` é types-only. **As duas cópias mudam juntas.**
- Gráficos: SVG à mão, sem lib; cores sempre via CSS custom properties.
- Datas aceitam futuro; validação de calendário real via `isValidIsoDate` (server); dinheiro com no máx. 2 casas decimais (`isValidMoneyAmount`).

## Política de testes

Toda mudança de comportamento em server ou web exige teste automatizado (ou justificativa explícita). Estilo/refactor sem mudança de comportamento/docs não exigem. Padrão: `src/**/*.test.ts` em ambos. Testes de rota/db do server usam banco temporário + `DATABASE_URL` setado ANTES de `await import('../../db')` (o client lê o env no top-level do módulo).

## Índice de decisões (docs/decisions/)

Leia o arquivo do domínio antes de mexer nele:

- **db-schema.md** — schema SQL completo, ALTERs idempotentes, índices.
- **wallets-portfolio.md** — carteira única (T-050/T-050b), validação de SELL, projeção de ganhos (T-056) + gráfico SVG (T-057b) + alocação (T-057c), falha de cotações sinalizada, AlertsPanel/CsvImport sem UI (T-026).
- **savings-goals.md** — progresso de metas manual × derivado (T-024), previsão de rendimento client-side (T-040), transferência poupança → meta (T-041).
- **expenses-budgets.md** — fixas × variáveis, recorrência lazy/idempotente (T-035), histórico mensal (T-033/T-049), orçamento por categoria (T-023/T-037), categoria normalizada (T-028), edição inline (T-031), dedupe de fetch (T-049).
- **income.md** — renda fixa × variável (T-036), sobra do mês real na Home (T-025).
- **validation-money-dates.md** — data de calendário real (T-043), máx. 2 casas decimais (T-052).
- **sessions-auth.md** — sessões persistentes no SQLite (T-034/T-046).
- **snapshots-history.md** — coleta diária no boot + agendador (T-058a/T-061/T-063), gráfico de evolução (T-058b), preço por ação (T-060), insights horários, DATABASE_URL/Turso.
