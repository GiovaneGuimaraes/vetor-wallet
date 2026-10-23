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

- `packages/portfolio-core` *(Core, T-099c; formato-alvo completo na T-104, fatias 1/2 e 2/2)*
  — posição, preço médio, validação de SELL contra a posição atual, série valor × custo,
  carteira única, snapshots diários e o gatilho de coleta no boot (`catchUpIfNeeded({ db })`,
  chamado por `rest-api/src/api/index.ts`). `db` injetado em tudo que toca banco; importar o
  package não abre conexão.
- `packages/operations-core` *(Core, T-104)* — o **CRUD** de `operations` e a leitura de
  `wallets` que vivia nas rotas, no formato-alvo (`db` injetado) — inclusive a leitura
  cronológica que `GET /api/portfolio` e `/history` usam (`listOperationsChronological`). Tem o
  acesso a dado; a regra continua no `portfolio-core`. A fusão dos dois foi avaliada ao fim da
  migração do `portfolio-core` e **adiada** para tarefa própria (ver o `CLAUDE.md` dele).
- `packages/alerts-core` *(Core, T-104)* — o **CRUD** de `alert_rules` que vivia na rota
  `/api/alerts`, no formato-alvo (`db` injetado). Validação de tipo/threshold continua na rota.
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

## 2b. Renda Fixa

**id**: `FixedIncome` *(T-091c/d, fatia c1)*
**Responsabilidade**: posições de Renda Fixa (caixinha, CDB, LCI/LCA, Tesouro, debênture,
CRI/CRA) — irmã de `Portfolio` dentro de Investimentos, **não** parte dele (decisão do humano:
"caixinha é Renda Fixa, irmã de Ações").

Packages:

- `packages/fixed-income-core` *(Core, nasceu no formato-alvo com `query: Query` injetado)* —
  CRUD de `fixed_income_positions` e o resumo (total aplicado × total atual, somado em
  centavos). Valor exibido = `current_value ?? invested_amount`; **não estima rendimento** por
  taxa (cálculo financeiro real, cruzaria com `insights-core` — fica para tarefa própria).
- `packages/rest-api` — `/api/fixed-income` (GET/POST/PATCH/DELETE, posição manual) e
  `/api/fixed-income/pluggy` (GET, posição da Pluggy lida **ao vivo**, nunca gravada). Validação
  de entrada mora na rota.
- `packages/web` — `RendaFixaPage.tsx` (CRUD manual + vínculo com a conexão bancária) e o hub
  `InvestimentosPage.tsx` (dashboard consolidado: Ações + Renda Fixa, alocação, vencimentos).

Por que é core próprio: não pode ir para o `portfolio-core` (regra dura — os números da B3 não
mudam por causa de Renda Fixa) nem para o `savings-core` (poupança é livro-razão de lançamentos;
isto é **posição**). A integração com a Pluggy (T-091d, fatias d1-d4, completa) **não grava nada**
— decisão do humano (P1, 2026-10-21): a posição da Pluggy é lida ao vivo de `/investments` a cada
acesso. O vínculo entre uma posição manual e um investimento da Pluggy (pra não contar a mesma
coisa duas vezes) é um único ponteiro, `superseded_by_pluggy_investment_id`, na própria linha
manual — não `source`/`external_id`. Detalhe em `packages/fixed-income-core/CLAUDE.md` e
`packages/pluggy-core/CLAUDE.md`. A fatia d4 também soma essa posição no patrimônio total da Home
(`packages/web/src/routes/homeMetrics.ts`), junto do saldo bancário da T-089e.

---

## 3. Renda

**id**: `Income`
**Responsabilidade**: fontes de renda fixas mensais e lançamentos avulsos datados.

Packages:

- `packages/rest-api` — `/api/income` (fixas, sem data) e `/api/income-entries?month=`
  (avulsas, T-036).
- `packages/web/src/routes` — página de renda e o cálculo da sobra do mês na Home (T-025).

Este módulo **ganhou `packages/income-core` na T-110d** (2026-09-20). A previsão anterior aqui
era de que ele não teria core, porque a lógica é CRUD com validação, sem regra de negócio própria
— o que **continua verdade**. O que mudou foi o critério: não é mais "tem regra de negócio?", e
sim "onde mora o SQL quando ele precisar ser reescrito?". O passo 3 da migração
(`docs/multi-agent/plano-migracao-aws.md`) tira o SQL das rotas para que a tradução
SQLite → Postgres tenha um lugar por query. Um core magro é o preço.

---

## 4. Despesas & Orçamentos

**id**: `Expenses`
**Responsabilidade**: despesas fixas e variáveis, recorrência, categorias normalizadas e
teto de gasto por categoria.

Packages:

- `packages/validation-core` *(Core transversal, T-099a)* — normalização de categoria
  (`normalizeCategory`, T-028), consumida por `db` (migração de dados) e `rest-api`.
- `packages/expenses-core` *(Core, T-099b; formato-alvo na T-110c)* — materialização
  lazy/idempotente de recorrências (T-035), o CRUD de despesa **fixa** (T-110c) e o CRUD de
  **lançamento variável** (T-104, fatia expense-entries: lista por mês, `/summary`, PATCH,
  DELETE). O POST de lançamento **não** está aqui — passa por `insertEntryWithExternalId`
  (`bank-import-core`), porque a dedupe por `external_id` é política do módulo BankImport.
- `packages/rest-api` — `/api/expenses`, `/api/expense-entries` (+ `/summary`),
  `/api/recurring-expenses`, `/api/budgets`. As duas primeiras ficaram **sem SQL**;
  `currentMonth`/`shiftMonthKey`/`MATERIALIZATION_HORIZON_MONTHS` continuam na rota por
  serem interpretação do parâmetro da request.
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
- `packages/web/src/routes` — gráfico de comparação.

---

## 8. Importação Bancária

**id**: `BankImport`
**Responsabilidade**: trazer dado de fora para dentro do app sem duplicar — extrato OFX,
transações/investimentos/saldo via Open Finance (Pluggy), tudo com Open Finance plugado **no
app**, não só por CLI.

Packages:

- `packages/bank-import-core` *(Core, T-099c)* — parser de OFX 1.x SGML / 2.x XML, o
  mapeamento das transações da Pluggy (T-087) com filtro de movimentação interna (T-088), a
  política de dedupe por `external_id` (T-084/T-085), e os `pluggy_items` por usuário + o job que
  itera os N items de um usuário (T-089a).
- `packages/pluggy-core` *(Integração, T-087 em diante)* — client HTTP da Pluggy: `POST /auth`
  (apiKey de 2h em cache), `GET /accounts?itemId=` (T-089e: inclui `balance`, pro patrimônio),
  `GET /v2/transactions` (cursor `next`), `GET /investments` (T-091d: paginação por página,
  `fetchPluggyInvestments`/`toPluggyInvestment`/`toPluggyFixedIncomePosition`), `POST
  /connect_token` + `DELETE /items/:id` (T-089b, pro widget de conexão no app). Nunca toca o
  banco.
- `packages/rest-api` — `POST /api/import/ofx` (`express.raw`, 1 MB); `/api/pluggy/*` (status,
  connect-token, items, sync, net-worth — T-089b/T-089e), gate `ENVIRONMENT`/
  `isPluggyIntegrationEnabled` (só `Staging` libera, fail closed) + `requireActiveSubscription`.
- `packages/web` — modal de conexão/import da Pluggy na Home (T-089c/d), botão de conectar banco
  liberado por `GET /api/pluggy/status`.
- `packages/cli` — `pluggy:sync [YYYY-MM-DD] [--dry-run]`, `pluggy:link` (registra/remove um item
  por usuário) e `pluggy:investments --dry-run` (diagnóstico de `/investments`, só contagem por
  tipo, nunca dado sensível — T-091d, fatia d1). Usuário-alvo via `PLUGGY_USER_EMAIL` (sem
  default silencioso).

Invariantes: crédito vira `income_entries`, débito vira `expense_entries`; `external_id` é
`ofx:<FITID>` ou `pluggy:<id>`; a rota responde **sempre 200** com relatório por transação
(`imported`/`duplicated`/`rejected`) — 400 só quando o documento inteiro é inválido.
Um `externalId` repetido no POST normal responde 409 `{ duplicate: true, entry }`.
No caminho Pluggy o relatório tem dois desfechos extra: `skipped` (transação `PENDING`, que
mudaria de valor ao efetivar) e `previewed` (só no `--dry-run`); `internal` marca movimentação
entre contas próprias/fatura/aplicação (T-088), que nunca vira lançamento.
Saldo bancário (T-089e) e Renda Fixa da Pluggy (T-091d) seguem doutrina oposta a transações: são
**posição**, lidas ao vivo a cada acesso, **nunca gravadas** — ver módulo `FixedIncome` (§2b) e
`packages/pluggy-core/CLAUDE.md`.

---

## Regras entre módulos

- Um package core pertence a **um** módulo. Se a lógica atravessa dois, ela mora no módulo dono
  da entidade primária.
- Módulos não se importam por conveniência: `subscription-core` não importa `portfolio-core`. Quando
  precisam se cruzar, quem orquestra é a rota em `rest-api`.
- A exceção são os core transversais sem módulo (`validation-core`, `db`, `shared`), que qualquer
  um pode usar.
