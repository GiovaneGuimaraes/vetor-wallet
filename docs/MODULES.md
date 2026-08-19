# Módulos do Vetor Wallet

Este documento descreve os **módulos de negócio (domínios)** do monorepo. Um módulo é um
subdomínio da aplicação e normalmente atravessa vários packages: o frontend (`packages/web`),
a API REST (`packages/rest-api`) e um ou mais packages de lógica (`packages/*-core`).

Para categorias de package, regras de dependência e onde colocar código novo, veja
[`PACKAGES.md`](./PACKAGES.md). Para as decisões de produto/implementação de cada domínio,
veja o `CLAUDE.md` do package core correspondente (as antigas notas de `docs/decisions/`).

> **Estado da migração.** Desde a T-099c (Ciclo 19) `packages/rest-api/src/api/services/` **não
> existe mais** — toda a lógica de domínio virou package e o `server` ficou só com Express
> (entry, routers, middleware). O que falta é renomear `server` → `rest-api` (T-100). Não
> procure um package marcado como *planejado* — ele não existe.

---

## 1. Auth

**id**: `Auth`
**Responsabilidade**: identidade (no **AWS Cognito** desde a T-106), sessão persistente e
perfil do usuário.

Packages:

- `packages/cognito-core` *(Integração, T-106)* — client HTTP do AWS Cognito: `SignUp`,
  `InitiateAuth` (`USER_PASSWORD_AUTH` e `REFRESH_TOKEN_AUTH`), `ConfirmSignUp`,
  `ResendConfirmationCode`, `GetUser`, `ChangePassword`. **Não toca o banco.**
- `packages/auth-core` *(Core, T-099c)* — dono da tabela `users`: espelho da identidade
  (`cognito_sub`, vínculo por e-mail normalizado), perfil e papéis (`grantRole`). Importa
  `portfolio-core` (`createUser` cria a carteira padrão) — exceção conhecida à regra 6, ver
  `PACKAGES.md`.
- `packages/db` *(Infraestrutura, T-097)* — `sessionStore` (sessões em SQLite, T-034/T-046).
- `packages/rest-api` — `POST /api/auth/register·login·logout·confirm·resend-code`,
  `GET/PATCH /me`, `POST /change-password`, e o middleware `requireAuth`/`requireAdmin` (fica
  aqui porque é Express). **É a rota que cruza `auth-core` e `cognito-core`** — o único lugar
  onde os dois se encontram.
- `packages/web/src/routes` — telas de login e cadastro (`interpretRegisterResult` decide o que
  fazer com os dois desfechos do cadastro).

Invariantes do domínio:

- **A troca de senha exige sessão e não a invalida** (T-094) — agora via `ChangePassword` do
  Cognito, com o access token guardado na sessão do **servidor** (nunca no browser).
- **A tela de login é nossa**: sem Hosted UI, sem redirect OAuth, sem JWT no front. A sessão
  segue sendo o cookie `sid` do `express-session` (decisão do humano, 2026-08-18).
- **A conta anterior ao Cognito é vinculada por e-mail** no primeiro login — nada é recriado —
  **e o vínculo exige `email_verified` no provedor**. Assumir uma linha de `users` que já existe
  é decisão de autorização: sem prova de posse do e-mail, quem soubesse o e-mail da vítima
  tomaria a conta dela. Criar conta **nova** não é gated. Vale para qualquer provedor de
  identidade futuro, não só o Cognito.
- Sem as variáveis do Cognito as rotas de auth respondem **503**, nunca tentam e quebram torto.

---

## 2. Carteira & Ações (B3)

**id**: `Portfolio`
**Responsabilidade**: operações manuais de compra/venda, posição por preço médio ponderado,
cotações em tempo real, histórico de preços e projeções.

Packages:

- `packages/portfolio-core` *(Core, T-099c)* — posição, preço médio, validação de SELL contra a
  posição atual, série valor × custo, carteiras, snapshots diários e o agendador de coleta.
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

- `packages/validation-core` *(Core transversal, T-099a)* — normalização de categoria
  (`normalizeCategory`, T-028), consumida por `db` (migração de dados) e `rest-api`.
- `packages/expenses-core` *(Core, T-099b)* — materialização lazy/idempotente de recorrências
  (T-035). Hoje: `services/recurringExpenses.ts`.
- `packages/rest-api` — `/api/expenses`, `/api/expense-entries` (+ `/summary`),
  `/api/recurring-expenses`, `/api/budgets`.
- `packages/web/src/routes` — página de despesas, histórico mensal, edição inline (T-031).

Invariante: `normalizeCategory` existe em **duas cópias** (`validation-core` e web) porque
`shared` é types-only e o web não consome packages de backend. As duas mudam juntas; veja a
nota em `PACKAGES.md`.

---

## 5. Poupança

**id**: `Savings`
**Responsabilidade**: reserva financeira (depósito/saque/rendimento).

Packages:

- `packages/savings-core` *(Core, T-099b)* — saldo da poupança em centavos inteiros.
- `packages/rest-api` — `/api/savings`.
- `packages/web/src/routes` — página de poupança, previsão de rendimento client-side (T-040).

**Metas saiu do módulo na T-091b1** (decisão do humano, 2026-08-14): com ela foram
`/api/goals`, `POST /api/savings/transfer-to-goal` (T-041), o progresso de meta
(T-024) e a página `/metas`. O **saldo livre virou o próprio saldo** — não há mais
reserva a descontar nem cópia duplicada da regra entre server e web. A limpeza do
banco (`goals`, `savings_entries.goal_id`, `idx_savings_entries_goal`) saiu na
**T-091b2** (2026-08-18) — nada de Metas resta no schema. `transfer_group` ficou,
como procedência do par legado.

---

## 6. Subscriptions (Assinatura Pix)

**id**: `Subscriptions` *(chamado `Billing` até a T-103)*
**Responsabilidade**: planos, cobrança Pix, ativação de assinatura e gating de escrita.

Packages:

- `packages/subscription-core` *(Core, T-103)* — regras de data e ativação:
  `markChargePaidAndActivate` como **única porta de ativação** (webhook, polling e simulação
  convergem nela), datas UTC no formato SQLite, valores em centavos. Inclui o provider
  AbacatePay em `src/providers/abacatepay/`: envelope `{ data, error, success }` (pode vir HTTP
  200 **com** `error`), timeout de 10s, nunca degrada em silêncio. Fusão de `billing-core` +
  `abacatepay-core` — Pix é forma de cobrar uma assinatura, não domínio próprio.
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

- `packages/insights-core` *(Core, T-099c)* — acumulado do período e série diária de benchmarks
  (T-068), e o job de insights horários. Importa `portfolio-core` — exceção conhecida à
  regra 6, ver `PACKAGES.md`.
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

- `packages/bank-import-core` *(Core, T-099c)* — parser de OFX 1.x SGML / 2.x XML, o
  mapeamento das transações da Pluggy (T-087) e a política de dedupe por `external_id`
  (T-084/T-085).
- `packages/pluggy-core` *(Integração, T-087)* — client HTTP da Pluggy: `POST /auth` (apiKey
  de 2h em cache), `GET /accounts?itemId=`, `GET /v2/transactions` seguindo o cursor `next`.
  Não toca o banco.
- `packages/rest-api` — `POST /api/import/ofx` (`express.raw`, 1 MB).
- `packages/cli` — `pluggy:sync [YYYY-MM-DD] [--dry-run]`: orquestra client + mapeamento e
  imprime o relatório. Usuário-alvo via `PLUGGY_USER_EMAIL` (sem default silencioso).

Invariantes: crédito vira `income_entries`, débito vira `expense_entries`; `external_id` é
`ofx:<FITID>` ou `pluggy:<id>`; a rota responde **sempre 200** com relatório por transação
(`imported`/`duplicated`/`rejected`) — 400 só quando o documento inteiro é inválido.
Um `externalId` repetido no POST normal responde 409 `{ duplicate: true, entry }`.
No caminho Pluggy o relatório tem dois desfechos extra: `skipped` (transação `PENDING`, que
mudaria de valor ao efetivar) e `previewed` (só no `--dry-run`).

---

## Regras entre módulos

- Um package core pertence a **um** módulo. Se a lógica atravessa dois, ela mora no módulo dono
  da entidade primária.
- Módulos não se importam por conveniência: `subscription-core` não importa `portfolio-core`. Quando
  precisam se cruzar, quem orquestra é a rota em `rest-api`.
- A exceção são os core transversais sem módulo (`validation-core`, `db`, `shared`), que qualquer
  um pode usar.
