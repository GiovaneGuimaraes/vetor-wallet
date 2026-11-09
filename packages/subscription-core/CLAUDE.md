# CLAUDE.md — @vetor-wallet/subscription-core

Assinatura e cobrança do Vetor Wallet (T-069/T-070/T-071): quem pode gravar, até
quando, e como o pagamento vira acesso. Categoria **Core**, módulo
**Subscriptions** (antes "Billing"). É dono das tabelas `plans`,
`subscriptions`, `pix_charges` e `billing_webhook_events`.

Substitui `docs/decisions/billing.md` (hoje um stub apontando para cá).

**T-114 (2026-10-23, passo 5 de `docs/multi-agent/plano-migracao-aws.md`): o
`db` do libSQL saiu das quatro funções com I/O.** `getActivePlan`,
`getPendingCharge`, `getSubscriptionRow` e `markChargePaidAndActivate` recebem
`query: Query` (`@vetor-wallet/query`) em vez de `db: Db`, com `{ text,
values }` e placeholders `$1, $2, ...` (convenção Postgres) em vez de `?`.
Nenhuma das quatro fazia `INSERT` com `lastInsertRowid` só para ler de volta
(o padrão de `createAlertRule`), então não há `RETURNING id` aqui. Molde
seguido à risca de `savings-core` (T-113, a migração real mais recente de um
package existente) e `alerts-core` (T-114, fatia 1). O `rest-api` **continua
em SQLite** — a rota/middleware injeta `createSqliteQuery(db)`
(`packages/query/src/createSqliteQuery.ts` — em `rest-api/src/api/sqliteQuery.ts` até a T-114), um adaptador que traduz `$N`
para `?` e devolve o `Db` de sempre por baixo. Nenhuma linha deste package
sabe disso; quando o Postgres entrar de verdade, a rota troca para
`createPgQuery(...)` sem tocar este core.

**O `db.batch([...], 'write')` de `markChargePaidAndActivate` saiu junto.**
`@vetor-wallet/query` não tem transação interativa por proxy — é dívida
conhecida, documentada no `CLAUDE.md` daquele package (mesmo buraco do
`createRecurringExpenseEntry` do `expenses-core`, ainda não migrado). O UPDATE
de `pix_charges` e o UPSERT de `subscriptions` viraram duas chamadas
sequenciais de `query`, NA MESMA ORDEM de antes. Isso não abriu brecha nova: a
idempotência contra uma segunda chamada concorrente (webhook + polling) já não
dependia da transação — ela vem de `status <> 'PAID'` no UPDATE (a segunda
chamada vira um no-op) e de `ON CONFLICT(user_id) DO UPDATE` no INSERT (nunca
duplica linha). O que a transação garantia e as duas chamadas sequenciais não
garantem mais: se o processo morrer EXATAMENTE entre as duas, a cobrança fica
PAID sem a assinatura ter sido ativada ainda — janela estreita, e a reconciliação
seria manual (mesmo espírito do risco aceito da cobrança órfã, mais abaixo).
**Essa janela não se autocorrige**: o early-return `if (charge.status === 'PAID')
return { activated: false, userId }` faz um novo webhook ou polling nessa mesma
cobrança devolver `activated: false` sem tentar ativar de novo — uma vez
materializada, a inconsistência fica presa até reconciliação manual, não só até
o próximo retry. Decisão de engenharia registrada em `docs/multi-agent/
TODO-HUMANO.md` (achado do revisor da T-114, fatia subscription-core).

## Origem: fusão de `billing-core` + `abacatepay-core` (T-103, Ciclo 20)

Os dois packages viraram um só. O motivo é conceitual, não de tamanho: **Pix é
uma forma de cobrar uma assinatura, não um domínio**. Enquanto o client da
AbacatePay era um package irmão, "quem orquestra o provedor" não tinha dono — e
a orquestração acabou espalhada por quatro rotas (era o item (c) da dívida do
Ciclo 19). Com o provedor dentro do core, existe um lugar óbvio para ela.

Consequência prática: trocar de provedor (ou suportar dois) é acrescentar
`src/providers/<nome>/` e escolher ali dentro, sem mexer em rota nenhuma.

> **`brapi-core` continua um package separado, e isso não é incoerência.** A
> brapi serve o Portfolio *e* o Insights; a AbacatePay só existe por causa da
> assinatura. Integração compartilhada por mais de um módulo continua sendo
> package próprio (regra 2 do `PACKAGES.md`); integração de um módulo só vive
> como provider dentro do core dele.

## Estrutura — uma função por arquivo

```
src/
├── index.ts                     # barrel: exports nomeados explícitos
├── parseInstant.ts              # datas
├── toSqliteUtc.ts
├── toSqliteUtcFromProvider.ts
├── nowSqliteUtc.ts
├── addInterval.ts
├── renewalBase.ts
├── isSubscriptionActive.ts      # estado
├── isBillingEnabled.ts
├── safeEqual.ts                 # HMAC do webhook
├── Plan.ts                      # PlanRow + toPlan
├── Subscription.ts              # SubscriptionRow + toSubscription
├── getActivePlan.ts             # leitura (query injetado, T-114)
├── getSubscriptionRow.ts
├── markChargePaidAndActivate.ts # ativação do Pix LEGADO (só o webhook; sai na etapa 2)
│   # ── assinatura recorrente no cartão: a REGRA (T-124b1) ──
├── AlreadySubscribedError.ts    # → 409 ALREADY_SUBSCRIBED na rota
├── ActivationPendingError.ts    # filho do anterior: pago, assinatura ainda não gravada
├── CheckoutInProgressError.ts   # → 409 CHECKOUT_IN_PROGRESS na rota
├── ProductPriceMismatchError.ts # → 502 BILLING_NOT_CONFIGURED na rota
├── ProductArchivedError.ts      # → 502 BILLING_NOT_CONFIGURED na rota
├── isActivationPending.ts       # "pago sem assinatura gravada" (recuperação)
├── getLatestCompletedCheckout.ts
├── getOpenCheckout.ts           # checkout OPEN (url/plano/data) para o /me (T-124b2)
├── getLatestCheckout.ts         # bill_ do portal (COMPLETED de preferência)
├── getBillingCustomer.ts        # cust_ do usuário, só leitura
├── ensureBillingCustomer.ts     # cust_ por usuário (billing_customers)
├── ensurePlanProduct.ts         # prod_ por (plano, preço) (plans.abacate_product_*)
├── assertCanStartCheckout.ts    # 409s ANTES de criar cliente (T-124c; startCardCheckout usa)
├── billingCustomerName.ts       # nome do cliente: perfil ou e-mail antes do @ (T-124c)
├── startCardCheckout.ts         # CREATING → OPEN; reaproveita/supersede
├── applyProviderSubscriptionState.ts # A PORTA ÚNICA (activate/renew/…)
├── reconcileCardSubscription.ts # consulta à API + throttling
└── providers/abacatepay/
    ├── AbacatePayError.ts
    ├── request.ts               # envelope, timeout, política de erro
    ├── isAbacatePayConfigured.ts
    │   # (createPixCharge, checkPixCharge, simulatePixPayment, AbacatePixCharge,
    │   #  sanitizeDescription, getPendingCharge e PixCharge saíram na T-124c)
    ├── webhookPublicKey.ts      # chave PÚBLICA fixa da doc (T-123)
    ├── verifyWebhookSignature.ts # esquema da doc + fallback legado (T-123)
    │   # ── assinatura recorrente no cartão (T-124a: só o client) ──
    ├── toAbacateCycle.ts        # 'monthly'|'yearly' → 'MONTHLY'|'ANNUALLY'
    ├── AbacateProduct.ts        # tipos + toAbacateProduct (id obrigatório)
    ├── AbacateSubscription.ts   # tipos + toAbacateSubscription (DEFENSIVO)
    ├── createCustomer.ts        # só e-mail + nome, sem CPF
    ├── createProduct.ts         # nome vai intacto (sem sanitizeDescription)
    ├── getProductByExternalId.ts # null SÓ para "não existe"; resto relança
    ├── createSubscriptionCheckout.ts # → { id: 'bill_…', url }
    ├── getSubscription.ts
    ├── listSubscriptionsByCheckout.ts # [] antes do pagamento é válido
    ├── cancelSubscription.ts    # cancela IMEDIATAMENTE
    ├── createCustomerPortal.ts
    ├── archiveProduct.ts        # limpeza
    ├── deleteSubscriptionCheckout.ts # apaga bill_ aberto (T-124b1)
    ├── isEmptySuccess.ts        # 2xx sem data = sucesso das ações void (T-124b1)
    └── abacatePayErrorText.ts   # texto do `error` do envelope
```

**Cartão (T-124a/T-124b1/T-124c).** O schema (`billing_customers`,
`subscription_checkouts`, colunas novas em `plans`/`subscriptions` — ver
`docs/decisions/db-schema.md`), o client acima e a regra (seção "Cartão: a
porta única", abaixo) são chamados pelas rotas `POST /api/subscriptions`
(T-124c), `/sync` e `/portal` (T-124b2); o webhook `subscription.*` é a T-124d.
**Desde a T-124c o Pix de assinatura saiu** (a loja não tem Pix Automático):
nenhuma rota cria cobrança Pix; `markChargePaidAndActivate` e o caminho
`transparent.completed`/`checkout.completed` do webhook FICAM para um QR
emitido antes do deploy ainda ativar — saem na etapa 2, com o DROP de
`pix_charges` (migração destrutiva em duas etapas). Contratos medidos na API
real (2026-11-08): `externalId` de produto repetido → 400 "already exists";
assinatura inexistente → 400 "Subscription not found"; `/subscriptions/list`
responde `data: []` antes do pagamento; o checkout volta como `bill_…` e o
`subs_…` só nasce pago. Ainda não medidos: o corpo de sucesso de
`/subscriptions/cancel` (tratado na T-124b1: `data: null` com 2xx e sem `error`
conta como sucesso — `isEmptySuccess`) e o formato exato de "produto não
encontrado" em `/products/get`.

**Um arquivo por função exportada, nome do arquivo = nome da função.** Tipos de
linha ficam junto do mapper que os projeta (`Plan.ts`, `Subscription.ts`). Nada de
arquivo-balaio: o antigo `billing.ts` tinha 322 linhas e 15 responsabilidades, e
era impossível abrir o teste de uma delas sem carregar as outras catorze.

## Banco chega INJETADO

Toda função com I/O recebe `query: Query` (o tipo vem de `@vetor-wallet/query`,
desde a T-114; o **singleton não é importado aqui** — nem o `db` do libSQL nem
um client de Postgres):

```ts
const plan = await getActivePlan({ query, planId: 1 });
const { activated, userId } = await markChargePaidAndActivate({ query, abacateChargeId });
```

Quem passa o client é a rota (ou o job, ou o teste). Dois ganhos, nessa ordem:

1. **Teste vira mock puro.** `createTestQuery()` (`tests/unit/testQuery.ts`)
   devolve um `jest.fn()` e pronto. Não existe banco temporário, `initDb`, nem
   `DATABASE_URL` setada antes de um `await import()` dinâmico. Testes de
   função pura, então, não tocam banco *de jeito nenhum*, nem por importar o
   vizinho.
2. **A conexão é decisão de quem orquestra.** Réplica de leitura, pool,
   SQLite hoje ou Postgres amanhã não são assunto de regra de negócio —
   `@vetor-wallet/query` é quem decide isso, não este package.

Este foi o padrão-alvo piloto (`db` injetado) para todos os `*-core`; a T-114
trocou esse piloto de `db` para `query`, mesmo molde de `savings-core` e
`alerts-core`.

## Invariantes (não quebrar)

### Unidade e datas

- **Dinheiro em CENTAVOS** neste domínio (`price_cents`, `amount_cents`) — é a
  unidade da AbacatePay. Todo o resto do app usa reais. Formatar é papel da UI.
- **Todo instante gravado sai de `toSqliteUtc`** (`'YYYY-MM-DD HH:MM:SS'`, UTC).
  Nunca `toISOString()` cru: o banco compara `current_period_end`/`expires_at`
  com `datetime('now')` e a comparação é lexicográfica — um `T` no meio faria
  qualquer data parecer futura (o `T` é maior que qualquer dígito).
  `toSqliteUtcFromProvider` normaliza o ISO da AbacatePay antes do INSERT;
  entrada inválida vira `null` ("sem expiração conhecida"), nunca
  `'Invalid Date'`.
- `parseInstant` trata instante **sem timezone explícito como UTC** — é o que
  `datetime('now')` grava; interpretar como hora local deslocaria o fim do
  período em até um dia dependendo de onde o server roda.
- `addInterval` soma o período em UTC com **clamp de dia** (31/01 + 1 mês →
  28/02, não 03/03 por overflow do `setUTCMonth`; 29/02 + 1 ano → 28/02).
- `renewalBase(agora, fim vigente)` = o maior dos dois: renovar antes de vencer
  soma ao que resta; renovar depois conta de agora.
- `isSubscriptionActive`: `active` com período **vencido** não vale. Desde a
  T-124b1, `canceled` com período **no futuro vale** (decisão 4 do humano:
  cancelar = acesso até o fim do período pago); vencido, não. O gate
  `requireActiveSubscription` herda isso sem mudar.

### Cartão: a porta única (T-124b1)

Plano completo em `docs/multi-agent/plano-t-124.md` (§A e §C).
`applyProviderSubscriptionState({ query, ref, transition, snapshot, nowIso, plan? })`
é a **única** função que grava ativação, renovação, falha de pagamento,
cancelamento ou troca de plano de assinatura de cartão. Webhook (T-124d) e
consulta (`reconcileCardSubscription`) chamam ela.

- **Decide pelo `rowCount` do UPDATE condicional, nunca por SELECT antes.** Os
  SELECTs só acham dono e plano; "esta chamada aplicou" é sempre o `rowCount`
  de uma escrita com a condição no `WHERE`:
  - `activate`: `UPDATE subscription_checkouts … WHERE abacate_checkout_id=$ AND
    status <> 'COMPLETED'` — só quem tem `rowCount = 1` calcula período. Depois,
    o UPSERT de `subscriptions` é **otimista** (`ON CONFLICT … DO UPDATE …
    WHERE status/current_period_end/abacate_subscription_id` ainda são os
    lidos); perdeu → relê e tenta de novo, até `MAX_ACTIVATION_ATTEMPTS` (3),
    depois lança. É o que pega dois checkouts DIFERENTES pagos ao mesmo tempo:
    o segundo relê, vê o `subs_` do primeiro e vira duplicada em vez de
    sobrescrevê-lo (o `subs_` sobrescrito continuaria cobrando sem ninguém ver).
  - `renew`: `UPDATE … WHERE current_period_end = $antigo AND
    current_period_end <= agora + RENEWAL_WINDOW_DAYS (3) AND status='active'` —
    webhook e consulta não estendem duas vezes; `ACTIVE` lido no meio do
    período não estende antes da hora. Novo fim =
    `addInterval(renewalBase(agora, fim antigo))`, ou a data de próxima
    cobrança do provedor quando válida e futura; se ela não passa do fim que já
    temos, **nega** (`provider_not_renewed`): o provedor ainda não renovou.
  - `payment_failed` (só `provider_status`), `cancel` (`WHERE status <>
    'canceled'`, `canceled_at` não é reescrito), `plan_changed` (plano por
    `plans.abacate_product_id`; desconhecido → no-op com motivo),
    `provider_status` (status remoto sem ação — PENDING/desconhecido: grava só
    `provider_status`, `status` intacto, sempre `reason:
    'remote_not_actionable'` + `providerStatus`; `applied` segue o `rowCount`
    como nas outras: true = gravou um status novo).
- **Dono sempre do nosso banco**: `subscription_checkouts.user_id` na ativação,
  `subscriptions.user_id` (por `abacate_subscription_id`) no resto. Ativação só
  por `{ checkoutId }` — por `subs_` não há dono conhecido. O plano ativado é o
  da LINHA do checkout (checkout antigo pago depois da troca de plano ativa o
  plano dele).
- **Só `id`, `status`, `providerStatus` e `nextBillingAt` do snapshot** são
  lidos; os demais campos de `AbacateSubscription` nunca foram vistos num
  pagamento real. `activate`/`renew` exigem `status === 'ACTIVE'` e `id`.
- **Em dúvida, nega** e devolve `{ applied: false, reason }` — a rota loga. Core
  não loga.
- **Duplicada** (decisão 6): ativação de um `subs_` quando a linha já tem
  OUTRO `subs_` com `status = 'active'` (mesmo vencida localmente — pode estar
  cobrando) → `{ duplicate: true, subscriptionIdToCancel: <o novo> }`, período
  intocado, checkout fica `COMPLETED` com o `subs_` novo como registro. **Quem
  cancela no provedor e registra o reembolso no TODO-HUMANO é a rota**
  (`cancelSubscription`; para PROVA do cancelamento, reler com
  `getSubscription` e conferir `CANCELLED`). O mesmo `subs_` chegando por outro
  checkout, ou a reentrega de uma ativação já aplicada, é no-op
  (`already_applied`) — nem estende nem pede um 2º cancelamento.
- **Pago sem assinatura gravada se AUTOCORRIGE** (achado do revisor da
  T-124b1; ao contrário da porta do Pix). Se o processo morrer entre o UPDATE
  do checkout e o UPSERT da assinatura — ou o UPSERT perder as 3 corridas — o
  checkout fica `COMPLETED` e a linha segue `pending`. `isActivationPending`
  reconhece esse estado: último checkout `COMPLETED` (com `subs_`) do usuário,
  linha `pending` sem aquele `subs_`, e `completed_at >= updated_at` da linha
  (é isso que separa o crash de histórico: uma duplicada antiga ou assinatura
  substituída tem `completed_at` anterior ao `pending` gravado pelo checkout
  seguinte). Três efeitos:
  1. `activate` com `rowCount` 0 entra em **recuperação** se o checkout (do
     nosso banco) tem EXATAMENTE o `subs_` do snapshot, o snapshot é `ACTIVE`
     e a linha está pendente — senão `already_applied`. O UPSERT otimista
     garante período UMA vez entre recuperações concorrentes.
  2. `reconcileCardSubscription` acha o checkout pendente, lê o `subs_` DELE
     no provedor e, se `ACTIVE`, chama `activate` (recuperação); outro status →
     `remote_not_actionable`. Intervalo curto (10 s): o usuário acabou de pagar.
  3. `startCardCheckout` recusa com **`ActivationPendingError`** (filho de
     `AlreadySubscribedError`) — não deixa pagar de novo.
  Fora do alcance: linha de `subscriptions` AUSENTE (só por intervenção manual;
  ela nasce no `startCardCheckout` antes do provedor), e crash concorrente com
  um SEGUNDO checkout pago (a linha deixa de estar `pending` e a duplicada não é
  detectada) — os dois exigem reconciliação manual.

`assertCanStartCheckout` (T-124c) é a primeira etapa de `startCardCheckout`,
extraída para a ROTA perguntar ANTES de `ensureBillingCustomer` — sem isso um
assinante (Pix legado no período, cartão ativo, pago confirmando) ganharia um
`cust_` na AbacatePay só para levar 409. Só lê. `billingCustomerName` decide o
nome mandado ao provedor: o do perfil; vazio, a parte do e-mail antes do `@`
com pontuação virando espaço; nada aproveitável, `Cliente Vetor Wallet`; teto
de 100 caracteres.

`startCardCheckout`: `AlreadySubscribedError` para qualquer assinatura dentro do
período (`isSubscriptionActive` — inclui Pix legado e `canceled` com período
pago) **e para cartão `active` com `subs_` mesmo vencido localmente** (pode estar
cobrando; o caminho é `sync` ou cancelar pelo portal). `CREATING` >2 min →
`FAILED`; `OPEN` do mesmo plano é devolvido sem chamar o provedor; de outro plano
vira `SUPERSEDED` (e é apagado no provedor, melhor esforço). A linha `CREATING`
nasce ANTES do provedor com `ON CONFLICT DO NOTHING RETURNING id` — sem linha de
volta, o índice único parcial recusou → `CheckoutInProgressError`. O UPSERT
`pending` vem antes do provedor (todo `OPEN` tem linha em `subscriptions`, onde
mora o throttling) e não rebaixa período pago nem cartão não cancelado. Falha do
provedor → `FAILED` + relança. O `customerId` chega pronto de
`ensureBillingCustomer` (a rota cruza o auth-core para e-mail/nome).

`ensurePlanProduct`: `externalId` do produto = **`<code>:<price_cents>`**, não só
o `code` (decisão da T-124b1): a AbacatePay não muda preço de produto nem aceita
`externalId` repetido, então com a chave só no código um preço novo acharia o
produto do preço velho. Com o preço na chave, preço novo = produto novo, e as
assinaturas antigas seguem no produto delas (plano §G). Produto achado com preço
declarado diferente do plano → lança (nunca cobra valor errado). Corrida →
400 "already exists" → relê por `externalId`.

Erros de configuração do produto são **tipados** (a rota mapeia para
502/`BILLING_NOT_CONFIGURED`, nunca 500): `ProductPriceMismatchError` (preço
declarado ≠ plano) e `ProductArchivedError` (`status` do produto
`ARCHIVED`/`INACTIVE` — o "delete" de produto só arquiva). Arquivado NÃO é
reativado nem recriado com a mesma chave (a API recusa `externalId` repetido):
resolver é humano — desarquivar no painel, ou mudar preço/código do plano (chave
nova). O `status` do produto não foi medido na API real; ausente, nada se
conclui. O caminho rápido (produto já gravado com o preço certo) não consulta o
provedor e não percebe arquivamento posterior — o checkout falha lá e a rota dá
502.

`ensureBillingCustomer`: `INSERT … ON CONFLICT(user_id) DO NOTHING`; `rowCount`
0 = perdeu a corrida → relê o vencedor e devolve o próprio `cust_` como
`orphanCustomerId` (a rota loga para limpeza).

`reconcileCardSubscription`: throttling por UPDATE condicional em
`subscriptions.last_synced_at` (10 s com checkout `OPEN`, 300 s nos demais, ou
`minIntervalSeconds`). `OPEN` → `listSubscriptionsByCheckout` (`ACTIVE` com id
→ `activate`); checkout pago sem assinatura → recuperação (acima); cartão
`active` com `subs_` → `getSubscription` (`CANCELLED` **ou `FAILED`** → `cancel`;
`ACTIVE` com fim dentro da janela → `renew` **deduzida**; `PENDING`/desconhecido
→ `provider_status`). **O custo da
dedução**: o provedor não diz "a cobrança deste ciclo passou"; se `ACTIVE`
continuar `ACTIVE` durante as retentativas de um cartão recusado, o usuário ganha
até ~um período sem ter pago (aceito no plano §H). A data de próxima cobrança,
quando vier, vence a dedução. `AbacatePayError` → `providerUnavailable: true`,
nunca lança; erro de banco (ou bug) sobe.

**Caminho de saída do usuário em cada estado** (o que a rota/UI oferece):

| Estado local (e remoto) | Acesso | Saída |
|---|---|---|
| `pending` + checkout `OPEN` | não | "Continuar pagamento" (mesma url); trocar de plano supersede |
| checkout pago, assinatura não gravada (`ActivationPendingError`) | não, até o `sync` | `sync` (recupera sozinho); remoto não-`ACTIVE` → humano (reembolso) |
| `active`, `provider_status='PAYMENT_FAILED'` | até o fim do período | portal (atualizar cartão); vencido sem renovar → `AlreadySubscribed` até `sync`/portal resolver |
| `active` + remoto `PENDING`/desconhecido | até o fim do período | `sync` de novo depois; o `provider_status` mostra o que o provedor disse |
| remoto `CANCELLED` ou `FAILED` → `canceled` | até o fim do período | vencido, **recomeçar** (`startCardCheckout` libera `canceled` vencido) |
| Pix legado `active` no período | até o fim | só assina no cartão depois de vencer |

Evidência contra SQLite real (`initDb` + `createSqliteQuery`, script fora do
repo): `ON CONFLICT DO NOTHING RETURNING id` devolve linha vazia no conflito, e
o UPSERT com `DO UPDATE … WHERE` falso dá `rowCount` 0 — as duas semânticas de
que a porta depende. Os testes usam `tests/unit/fakeBillingDb.ts`, um banco de
mentira COM estado que reproduz essas semânticas e intercala instruções em
`Promise.all`.

### Ativação do Pix legado: uma porta só

`markChargePaidAndActivate({ query, abacateChargeId })` é a **única** função
que ativa assinatura **Pix** (legado). Desde a T-124c só o webhook
(`transparent.completed`/`checkout.completed`) a chama — o polling
(`GET /api/pix-charges/:id`) e a simulação (`/api/billing/simulate`) saíram com
o Pix de assinatura; ela fica até a etapa 2 para um QR emitido antes do deploy
ainda ativar. É idempotente por dois mecanismos combinados:

1. `UPDATE pix_charges ... WHERE abacate_charge_id = $1 AND status <> 'PAID'`;
2. `INSERT ... ON CONFLICT(user_id) DO UPDATE` da assinatura.

Antes da T-114 as duas rodavam num único `db.batch([...], 'write')`
(transação); hoje são duas chamadas sequenciais de `query`, na mesma ordem —
`@vetor-wallet/query` não tem transação interativa por proxy (ver nota no topo
deste arquivo). Nenhum dos dois mecanismos de idempotência dependia da
transação para ser seguro contra uma segunda chamada concorrente.

Webhook e polling concorrentes não somam período duas vezes — a segunda chamada
responde `activated: false`. O dono da assinatura é **sempre
`pix_charges.user_id`** — nunca `metadata.userId` do payload, que é dado de fora
e daria a quem forjasse um webhook a chance de ativar a assinatura de outra
pessoa. É por isso que a função recebe só o id da cobrança e vai buscar o dono.

Casos travados: cobrança expirada paga tarde **ativa** (o dinheiro entrou);
plano desativado depois da compra **ativa** (`getActivePlan` não filtra
`active`, de propósito — senão a assinatura de um plano descontinuado apareceria
sem nome); assinatura vencida comprando de novo é permitida.

### Provider AbacatePay

- **Envelope `{ data, error, success }`, e a API pode responder HTTP 200 com
  `error` preenchido** — checar `res.ok` não basta. `abacatePayRequest` trata
  como erro sempre que `!res.ok || body == null || body.error != null ||
  body.data == null`.
- **Timeout de 10s**, não 5s como o `brapi-core`. Cobrança não tem fallback nem
  cache: se o POST de criação estourar, o usuário fica sem checkout.
- **Nunca degrada em silêncio.** Ao contrário de `fetchQuotes`, qualquer falha
  vira `AbacatePayError` lançado — nunca `null`/valor vazio. Engolir a falha de
  uma cobrança criaria assinatura sem pagamento (ou o inverso).
- **`AbacatePayError.status === 0` significa rede/timeout** (nenhuma resposta
  chegou) — distinção necessária entre "recusado pelo provedor" e "não sabemos,
  pode ter passado".
- **Campos opcionais ausentes são omitidos do JSON** (`undefined` não
  serializa), nunca enviados como `null` — a API rejeita `null` onde espera
  objeto.
- **`description` de cobrança Pix: conjunto estreito de caracteres** (o
  `sanitizeDescription` que aplicava isto saiu com o Pix na T-124c; o
  conhecimento fica). A API responde 400 `Disallowed character in description`
  para caractere fora do conjunto: caem `—`/`–`, aspas tipográficas, `€`, `$` e
  NBSP; passam letras (acentuadas inclusive), dígitos e
  `- . , : ; / # & ( ) @ % + = _` (medido contra a v2 em 2026-11-08). Tamanho:
  80 caracteres passam, 200 dão 422 (a doc diz máx. 140; o corte usado era 80, o
  maior valor comprovado). O app punha um `—` em `Vetor Wallet — <plano>` e
  **toda assinatura virava 502 "provedor indisponível"** — o 400 do provedor
  ficava escondido atrás da mensagem genérica. O nome de PRODUTO e de CLIENTE
  não tem essa restrição (medido: acento, travessão e 130+ chars passam), mas
  campo livre novo mandado ao provedor precisa ser medido antes. As rotas logam
  `billing.checkout.failed` com o `providerStatus` para um 400 desses não ficar
  invisível.
- **Env é lido dentro da função**, não no top-level do módulo.
- O provider **não toca o banco**: traduz o mundo externo em tipos nossos e
  devolve. Quem persiste é o resto do core. A fronteira da regra 2 do
  `PACKAGES.md` continua valendo, agora como fronteira de *pasta*.

### Outros

- `safeEqual` **não lança**: `timingSafeEqual` exige buffers do mesmo tamanho
  (`RangeError` caso contrário), que é justamente o caso mais comum de secret
  errado. Comprimento diferente já é "não confere" — vaza só o tamanho.
- **Não importa `express`** nem nada de `server`/`web` (regra 1 de
  `docs/PACKAGES.md`).

## Testes — Jest, fora do `src/`

```
tests/
├── tsconfig.json           # paths: src/* e tests/*
└── unit/
    ├── jest.config.ts      # rootDir = raiz do package, thresholds 100%
    ├── jest.stryker.config.ts
    ├── setupTests.ts       # limpa env de billing entre casos
    ├── testQuery.ts        # Query de mentira (T-114; substituiu createMockDb.ts)
    ├── fakeBillingDb.ts    # Query COM estado p/ a regra do cartão (corridas, T-124b1)
    ├── mockFetch.ts        # fetch global de mentira
    └── tests/*.test.ts     # UM por arquivo de src/
```

`pnpm --filter @vetor-wallet/subscription-core test`.

Regras:

- **Um `*.test.ts` por arquivo de `src/`**, mesmo nome. Achar o teste de uma
  função é olhar o nome dela.
- **Teste fica FORA do `src/`** e importa por `src/...` (path alias). É o que
  torna explícito que o teste olha de fora para dentro, e o que mantém o
  `tsconfig` de produção sem `exclude` de teste.
- **Não mocke funções deste package.** Mocke as bordas: `query` (injetado) e
  `fetch` (global). `markChargePaidAndActivate` é testada de ponta a ponta
  contra uma `query` de mentira, não com `getActivePlan` mockado — senão o
  teste para de provar a regra e passa a provar a chamada.
- **Cobertura 100%** (statements/branches/functions/lines), com `src/index.ts`
  fora da conta por ser só re-export. Threshold que não é 100 vira 99, depois
  95: o piso só significa alguma coisa enquanto for o teto.
- **Snapshot no SQL**, não no resultado inteiro: as queries são o contrato com
  o banco, e uma mudança silenciosa de `WHERE` é exatamente o que passa
  despercebido numa review.
- Roteie leituras por trecho de SQL (`text.includes('FROM plans')`) em vez de
  `mockResolvedValueOnce` em sequência — a ordem das queries é detalhe de
  implementação e travá-la faz reordenação inofensiva quebrar o teste.

### Mutation testing (Stryker)

`pnpm --filter @vetor-wallet/subscription-core mutation`. **Sob demanda — não
faz parte do `pnpm test` nem do CI de PR.** Cobertura diz que a linha rodou;
mutation score diz se algum assert olhava para ela. Usa
`tests/unit/jest.stryker.config.ts`, que desliga cobertura e thresholds (o
Stryker roda subconjuntos da suíte, então cobertura parcial é esperada).

## Rotas (ficam no `server`)

- `GET /api/plans` — só `active = 1`, mais barato primeiro. **Única rota de dados
  sem filtro por `user_id`**: `plans` é catálogo global, sem coluna de dono.
- `POST /api/subscriptions` (cartão, T-124c) → **201** `{ subscription,
  checkout: { id, url } }` (id LOCAL; `bill_`/`cust_`/`subs_` nunca saem). 400
  planId inválido; 404 plano inexistente **ou inativo** (indistinguíveis de
  propósito); 503 `BILLING_NOT_CONFIGURED` sem `ABACATEPAY_API_KEY` (antes de
  qualquer escrita); `assertCanStartCheckout` ANTES do cliente; e-mail/nome do
  auth-core (`findUserById` + `billingCustomerName`); `ensureBillingCustomer` →
  `startCardCheckout` com `completionUrl`/`returnUrl` =
  `<origem>/planos?checkout=completed|returned`, a origem vinda SÓ de
  `ALLOWED_ORIGIN` (1ª origem http(s) válida de uma lista; default
  `http://localhost:5173`) — nunca da request (redirect aberto). Erros por
  `mapBillingError`: 409 `ALREADY_SUBSCRIBED`/`CHECKOUT_IN_PROGRESS`/
  `ACTIVATION_PENDING`, 502 `BILLING_NOT_CONFIGURED` (produto com preço errado/
  arquivado), 502 `PAYMENT_PROVIDER_ERROR` (`AbacatePayError`, log
  `billing.checkout.failed` com `providerStatus`). Logs: `billing.customer.
  created|reused|orphan`, `billing.checkout.created` (`planId`, `reused`,
  `superseded`), `billing.checkout.supersededDeleteFailed`,
  `billing.checkout.refused` (`reason` = código) — sem e-mail, valor nem id do
  provedor. Sem simulação em dev: cartão de teste `4242 4242 4242 4242` na página
  hospedada.
- `GET /api/subscriptions/me` — sempre 200. `active` com período vencido é
  reportado como `expired` **computado na leitura, sem gravar** (um GET que
  escreve viraria corrida com a ativação). `pendingCharge` saiu na T-124c.
- `POST /api/subscriptions/sync` e `/portal` — ver `packages/rest-api/CLAUDE.md`
  (T-124b2).
- `GET /api/pix-charges/:id` e `POST /api/billing/simulate/:chargeId` **saíram
  na T-124c** (404). `pix_charges` fica no banco até a etapa 2.

## Webhook

`POST /api/webhooks/abacatepay`, sem sessão. **Montado antes de
`app.use(express.json())`** em `api/index.ts` — o json global consome o stream e
marca `req._body`, o que faria o `express.raw` do router ser pulado e o HMAC ser
calculado sobre um corpo reserializado (quebra silenciosa: 401 em todo evento
legítimo). Essa linha não pode descer.

Ordem do handler: secret ausente no env → 401 (**fail-closed**); `?webhookSecret`
via `safeEqual` → 401; `verifyWebhookSignature` sobre o Buffer contra
`x-webhook-signature` (header ausente é 401 — validação dupla obrigatória) →
401; JSON inválido → 400; evento fora de `transparent.completed` /
`checkout.completed` → **200 `ignored`** (4xx/5xx faria reentrega eterna);
idempotência por `INSERT OR IGNORE` em `billing_webhook_events` (`event_id`, com
fallback `` `${event}:${chargeId}` ``) → 200 `duplicate`; então
`markChargePaidAndActivate`. Cobrança desconhecida → 200 `unknownCharge`. Erro
de banco **não** é capturado: 500 faz o provedor reentregar, que é o desejável.

### Assinatura: dois esquemas, e o que cada camada prova (T-123)

A doc oficial (`docs.abacatepay.com/pages/webhooks/security`, lida em
2026-11-08) diz que `X-Webhook-Signature` é HMAC-SHA256 do corpo cru com uma
**chave PÚBLICA fixa da AbacatePay** (`ABACATEPAY_WEBHOOK_PUBLIC_KEY`, copiada
literalmente da página para `webhookPublicKey.ts`), em **base64**. Até a T-123
o app validava HMAC hex com o NOSSO segredo — se a doc estiver certa, todo
webhook real levava 401 e nenhum Pix pago ativava assinatura pelo webhook (só
pelo polling).

`verifyWebhookSignature({ rawBody, signature, legacySecret })` devolve o esquema
que casou ou `null`:

1. `'abacatepay-public-key'` — o da doc (base64, sem prefixo);
2. `'legacy-secret'` — o antigo (nosso segredo, hex, aceita `sha256=`), mantido
   como **fallback** porque nunca recebemos uma entrega real (sem URL pública)
   que prove qual dos dois a AbacatePay manda de fato.

Comparação sempre por `safeEqual` (tempo constante, não lança com tamanho
diferente). Assinatura vazia nunca casa; `legacySecret` vazio desliga o legado.

**A chave pública prova só INTEGRIDADE, nunca ORIGEM.** Ela está publicada na
doc: qualquer um assina um corpo forjado com ela. Por isso o `?webhookSecret=`
da URL (comparado ao nosso `ABACATEPAY_WEBHOOK_SECRET`) **continua obrigatório e
é a prova de origem** — e o fail-closed sem o env continua valendo para os dois
esquemas. Afrouxar o `webhookSecret` "porque agora a assinatura é a da doc"
transformaria o endpoint em ativação pública de assinatura.

A rota loga `webhook.signature` com `scheme` (`abacatepay-public-key` |
`legacy-secret` | `none`), `matched` e `headerPresent` — **nunca** a assinatura,
o corpo, o segredo ou a chave. O log só sai depois de o `?webhookSecret=`
passar. A primeira entrega real em produção diz qual esquema vale; quando
houver essa prova, o outro pode sair (decisão a registrar então, não agora).

## Gating (T-071)

`api/middleware/requireActiveSubscription.ts` (no `server`), sempre montado com
um único `router.use(...)` logo depois do `router.use(requireAuth)`.

- **Flag desligada = no-op literal**: sem `BILLING_ENABLED=true` chama `next()`
  sem tocar o banco (staging não paga a query; a suíte existente segue verde sem
  saber de assinatura). Flag ausente conta como `false`.
- **Só escrita**: `GET`/`HEAD`/`OPTIONS` passam sempre — é o que permite o
  `router.use` único, sem enumerar handler por handler. Quem não paga continua
  lendo os próprios dados, só não grava. Efeito colateral aceito: a
  materialização lazy de recorrências (T-035, `@vetor-wallet/expenses-core`)
  roda no `GET` de expense-entries e segue livre.
- Sem assinatura válida (`isSubscriptionActive`) → **402**
  `{ error, code: 'SUBSCRIPTION_REQUIRED' }`. Erro de banco → `next(err)`, nunca
  liberação "por precaução".
- **Onde está**: operations, import, income, income-entries, expenses,
  expense-entries, recurring-expenses, savings (budgets saiu na T-118).
- **Onde NÃO está** (de propósito): auth, plans, subscriptions (inclusive
  `/sync` e `/portal`), webhooks (senão o usuário não conseguiria comprar), leitura
  (portfolio, benchmarks, snapshots, tickers), admin e **wallets** — o `POST`
  de wallets é o lazy-create do onboarding e bloquear ele travaria o usuário
  antes de ele conseguir pagar.

## UI (T-072; cartão desde a T-124c, no `web`)

Rota `/planos`: vitrine com preço em BRL (`Intl.NumberFormat`); "Assinar" →
`POST /api/subscriptions` → redirect para a página hospedada do checkout. Ao
abrir, a tela SEMPRE chama `/sync` uma vez (o servidor faz o throttling; é o
que conserta renovação/cancelamento não visto, inclusive para quem chega pelo
redirect global do 402 `SUBSCRIPTION_REQUIRED`). Voltando com
`?checkout=completed`, mostra "Confirmando pagamento…" e repete o `sync` com
backoff (`nextPollDelayMs`) até ~2 min ou até o acesso aparecer, depois tira o
parâmetro da URL (replace). Estados (`subscriptionUiState`): pending_checkout
("Continuar pagamento"), confirming, active ("Gerenciar assinatura" → portal),
payment_failed ("Atualizar cartão" → portal), canceled_with_access ("acesso
até X"), legacy_pix ("não renova"; assina no cartão só depois de vencer),
expired, none, staging (banner). **`hasPaidAccess` espelha `isSubscriptionActive`**
(canceled com período no futuro tem acesso) — gate e tela concordam. Saíram o
painel Pix (QR, copia-e-cola, contagem), o polling de cobrança e o "Simular
pagamento". Não há botão de cancelar no app: cancelar é pelo portal.

Lógica pura vive em `web/src/routes/planos.ts` com testes ao lado; componentes
só renderizam (costura em `PlanosPage.test.tsx`).

## Risco aceito: cobrança órfã (Pix legado — histórico)

Valia para a criação de cobrança Pix, que saiu na T-124c. No cartão o risco não
existe: a linha local de `subscription_checkouts` nasce ANTES do provedor
(`externalId = checkout:<id local>`).

## Env

`ABACATEPAY_API_KEY`, `ABACATEPAY_API_URL` (default
`https://api.abacatepay.com/v2`), `ABACATEPAY_WEBHOOK_SECRET`, `BILLING_ENABLED`
(default `false`; `'true'` ativa gating; exposto em `GET /api/subscriptions/me`
como `billingEnabled` para a UI esconder a oferta em staging).

Em produção: as quatro definidas + `NODE_ENV=production`, e o webhook registrado
no dashboard da AbacatePay como
`https://<dominio>/api/webhooks/abacatepay?webhookSecret=<secret>` nos eventos
`transparent.completed` e `checkout.completed`.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` e `docs/MODULES.md`.
