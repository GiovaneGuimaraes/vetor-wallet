# Módulos do Vetor Wallet

Este documento descreve os **módulos de negócio (domínios)** do monorepo. Um módulo é um
subdomínio da aplicação e normalmente atravessa vários packages: o frontend (`packages/web`),
a API REST (`packages/rest-api`) e um ou mais packages de lógica (`packages/*-core`).

Para categorias de package, regras de dependência e onde colocar código novo, veja
[`PACKAGES.md`](./PACKAGES.md). Para as decisões de produto/implementação de cada domínio,
veja o `CLAUDE.md` do package core correspondente (as antigas notas de `docs/decisions/`).

> **Estado da migração.** A arquitetura descrita aqui é o **alvo**. Hoje quase toda a lógica
> ainda mora em `packages/server/src/api/services/`. Cada módulo abaixo marca o que já existe
> como package e o que ainda está por extrair. Não procure um package marcado como *planejado* —
> ele não existe.

---

## 1. Auth

**id**: `Auth`
**Responsabilidade**: identidade, credenciais, sessão persistente e perfil do usuário.

Packages:

- `packages/auth-core` *(planejado)* — registro, login, hash bcrypt, troca de senha, papéis
  (`grantRole`). Hoje em `server/src/api/auth/service.ts`.
- `packages/db` *(planejado)* — `sessionStore` (sessões em SQLite, T-034/T-046).
- `packages/rest-api` — `POST /api/auth/register·login·logout`, `GET/PATCH /me`,
  `POST /change-password`, e o middleware `requireAuth`/`requireAdmin` (fica aqui porque é Express).
- `packages/web/src/routes` — telas de login e cadastro.

Invariante do domínio: a troca de senha exige sessão e **não** a invalida (T-094).

---

## 2. Carteira & Ações (B3)

**id**: `Portfolio`
**Responsabilidade**: operações manuais de compra/venda, posição por preço médio ponderado,
cotações em tempo real, histórico de preços e projeções.

Packages:

- `packages/portfolio-core` *(planejado)* — posição, preço médio, validação de SELL contra a
  posição atual, série valor × custo, snapshots diários e o agendador de coleta.
  Hoje: `services/portfolio.ts`, `portfolioHistory.ts`, `wallets.ts`, `snapshots.ts`,
  `snapshotScheduler.ts`.
- `packages/brapi-core` *(Integração, T-098)* — client HTTP da [brapi.dev](https://brapi.dev):
  cotações e busca de tickers.
- `packages/rest-api` — `/api/wallets`, `/api/operations`, `/api/portfolio`, `/api/snapshots`,
  `/api/tickers`, `/api/alerts`, `/api/import` (CSV de corretora).
- `packages/web/src/routes` — página da carteira, gráfico SVG de evolução e alocação.
- `packages/cli` — jobs de coleta de snapshots.

Invariantes: carteira **única** por usuário (T-050) — o `POST` recusa a segunda; `walletId`
enviado pelo cliente é sempre ignorado; falha de cotação degrada em silêncio e é sinalizada
como `quotesUnavailable`, nunca derruba a request.

---

## 3. Renda

**id**: `Income`
**Responsabilidade**: fontes de renda fixas mensais e lançamentos avulsos datados.

Packages:

- `packages/rest-api` — `/api/income` (fixas, sem data) e `/api/income-entries?month=`
  (avulsas, T-036).
- `packages/web/src/routes` — página de renda e o cálculo da sobra do mês na Home (T-025).

Este módulo **não tem package core** e provavelmente não vai ter: a lógica é CRUD com validação,
sem regra de negócio própria. Se um dia ganhar regras (projeção de renda, recorrência),
nasce `packages/income-core`.

---

## 4. Despesas & Orçamentos

**id**: `Expenses`
**Responsabilidade**: despesas fixas e variáveis, recorrência, categorias normalizadas e
teto de gasto por categoria.

Packages:

- `packages/expenses-core` *(planejado)* — normalização de categoria (T-028) e materialização
  lazy/idempotente de recorrências (T-035). Hoje: `services/categories.ts`, `recurringExpenses.ts`.
- `packages/rest-api` — `/api/expenses`, `/api/expense-entries` (+ `/summary`),
  `/api/recurring-expenses`, `/api/budgets`.
- `packages/web/src/routes` — página de despesas, histórico mensal, edição inline (T-031).

Invariante: `normalizeCategory` existe em **duas cópias** (server e web) porque `shared` é
types-only. As duas mudam juntas — a extração para `expenses-core` não resolve isso sozinha
(o web não consome packages de backend); veja a nota em `PACKAGES.md`.

---

## 5. Poupança & Metas

**id**: `Savings`
**Responsabilidade**: reserva financeira (depósito/saque/rendimento) e metas com progresso
manual ou derivado de aportes vinculados.

Packages:

- `packages/savings-core` *(planejado)* — saldo livre, resumo, progresso de meta manual ×
  derivado (T-024) e a transferência poupança → meta como par atômico (T-041).
  Hoje: `services/savings.ts`, `goals.ts`.
- `packages/rest-api` — `/api/savings` (+ `/transfer-to-goal`), `/api/goals`.
- `packages/web/src/routes` — páginas de poupança e metas, previsão de rendimento client-side (T-040).

Invariante: o cálculo de saldo livre também está duplicado entre server e web — mesma regra
de "as duas cópias mudam juntas".

---

## 6. Billing (Assinatura Pix)

**id**: `Billing`
**Responsabilidade**: planos, cobrança Pix, ativação de assinatura e gating de escrita.

Packages:

- `packages/billing-core` *(planejado)* — regras de data e ativação: `markChargePaidAndActivate`
  como **única porta de ativação** (webhook, polling e simulação convergem nela), datas UTC no
  formato SQLite, valores em centavos. Hoje: `services/billing.ts`.
- `packages/abacatepay-core` *(Integração, T-098)* — client HTTP da AbacatePay: envelope
  `{ data, error, success }` (pode vir HTTP 200 **com** `error`), timeout de 10s, nunca degrada
  em silêncio.
- `packages/rest-api` — `/api/plans`, `/api/subscriptions`, `/api/pix-charges/:id`,
  `/api/webhooks/abacatepay` (HMAC, montado **antes** do `express.json()`),
  `/api/billing/simulate/:chargeId` (404 em produção) e o middleware
  `requireActiveSubscription` (T-071).
- `packages/web/src/routes` — seleção de plano, QR Code e polling do pagamento.

Nota: `/api/plans` é a **única** rota de dados sem filtro por `user_id` (catálogo global).

---

## 7. Insights & Benchmarks

**id**: `Insights`
**Responsabilidade**: comparação da carteira com CDI/Ibovespa e geração de insights periódicos.

Packages:

- `packages/insights-core` *(planejado)* — acumulado do período e série diária de benchmarks
  (T-068), e o job de insights horários. Hoje: `services/benchmarks.ts`, `benchmarkHistory.ts`,
  `hourlyInsights.ts`.
- `packages/rest-api` — `/api/benchmarks`, `/api/benchmarks/history?days=`,
  `POST /api/admin/run-insights-job`.
- `packages/cli` — `insights:hourly [YYYY-MM-DD]`.
- `packages/web/src/routes` — gráfico de comparação.

---

## 8. Importação Bancária

**id**: `BankImport`
**Responsabilidade**: trazer lançamentos de fora para dentro do app sem duplicar — extrato OFX
hoje, Open Finance via Pluggy depois.

Packages:

- `packages/bank-import-core` *(planejado)* — parser de OFX 1.x SGML / 2.x XML e a política de
  dedupe por `external_id` (T-084/T-085). Hoje: `services/ofx.ts`, `externalId.ts`.
- `packages/pluggy-core` *(planejado — Integração, Onda C)* — conexão Open Finance, sincronia
  de transações. **Nasce direto como package**, não passa por `services/`.
- `packages/rest-api` — `POST /api/import/ofx` (`express.raw`, 1 MB).

Invariantes: crédito vira `income_entries`, débito vira `expense_entries`; `external_id` é
`ofx:<FITID>`; a rota responde **sempre 200** com relatório por transação
(`imported`/`duplicated`/`rejected`) — 400 só quando o documento inteiro é inválido.
Um `externalId` repetido no POST normal responde 409 `{ duplicate: true, entry }`.

---

## Regras entre módulos

- Um package core pertence a **um** módulo. Se a lógica atravessa dois, ela mora no módulo dono
  da entidade primária.
- Módulos não se importam por conveniência: `billing-core` não importa `portfolio-core`. Quando
  precisam se cruzar, quem orquestra é a rota em `rest-api`.
- A exceção são os core transversais sem módulo (`validation-core`, `db`, `shared`), que qualquer
  um pode usar.
