# CLAUDE.md — @vetor-wallet/subscription-core

Assinatura e cobrança do Vetor Wallet (T-069/T-070/T-071): quem pode gravar, até
quando, e como o pagamento vira acesso. Categoria **Core**, módulo
**Subscriptions** (antes "Billing"). É dono das tabelas `plans`,
`subscriptions`, `pix_charges` e `billing_webhook_events`.

Substitui `docs/decisions/billing.md` (hoje um stub apontando para cá).

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
├── PixCharge.ts                 # PixChargeRow + toPixCharge
├── getActivePlan.ts             # leitura (db injetado)
├── getSubscriptionRow.ts
├── getPendingCharge.ts
├── markChargePaidAndActivate.ts # ativação (db injetado)
└── providers/abacatepay/
    ├── AbacatePayError.ts
    ├── AbacatePixCharge.ts      # tipos + toAbacatePixCharge
    ├── request.ts               # envelope, timeout, política de erro
    ├── isAbacatePayConfigured.ts
    ├── createPixCharge.ts
    ├── checkPixCharge.ts
    └── simulatePixPayment.ts
```

**Um arquivo por função exportada, nome do arquivo = nome da função.** Tipos de
linha ficam junto do mapper que os projeta (`Plan.ts`, `PixCharge.ts`). Nada de
arquivo-balaio: o antigo `billing.ts` tinha 322 linhas e 15 responsabilidades, e
era impossível abrir o teste de uma delas sem carregar as outras catorze.

## Banco chega INJETADO

Toda função com I/O recebe `db: Db` (o tipo vem de `@vetor-wallet/db`, o
**singleton `db` não é importado aqui**):

```ts
const plan = await getActivePlan({ db, planId: 1 });
const { activated, userId } = await markChargePaidAndActivate({ db, abacateChargeId });
```

Quem passa o client é a rota (ou o job, ou o teste). Dois ganhos, nessa ordem:

1. **Teste vira mock puro.** `createMockDb()` devolve
   `{ execute: jest.fn(), batch: jest.fn() }` e pronto. Não existe mais banco
   temporário, `initDb`, nem `DATABASE_URL` setada antes de um
   `await import()` dinâmico — o dança que o `client.ts` do `db` obrigava por
   ler o env no top-level do módulo. Testes de função pura, então, não tocam
   banco *de jeito nenhum*, nem por importar o vizinho.
2. **A conexão é decisão de quem orquestra.** Réplica de leitura, transação já
   aberta ou outro client não são assunto de regra de negócio.

Este é o padrão-alvo para todos os `*-core`; o `subscription-core` é o piloto.

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
- `isSubscriptionActive`: `active` com período **vencido** não vale.

### Ativação: uma porta só

`markChargePaidAndActivate({ db, abacateChargeId })` é a **única** função que
ativa assinatura. Webhook, polling (`GET /api/pix-charges/:id`) e a rota de
simulação chamam ela. É idempotente por dois mecanismos combinados:

1. `UPDATE pix_charges ... WHERE abacate_charge_id = ? AND status <> 'PAID'`;
2. `INSERT ... ON CONFLICT(user_id) DO UPDATE` da assinatura, num único
   `db.batch([...], 'write')` (transação) com a cobrança.

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
  cache: se o POST de criação estourar, o usuário fica sem QR Code.
- **Nunca degrada em silêncio.** Ao contrário de `fetchQuotes`, qualquer falha
  vira `AbacatePayError` lançado — nunca `null`/valor vazio. Engolir a falha de
  uma cobrança criaria assinatura sem pagamento (ou o inverso).
- **`AbacatePayError.status === 0` significa rede/timeout** (nenhuma resposta
  chegou) — distinção necessária entre "recusado pelo provedor" e "não sabemos,
  pode ter passado".
- **Campos opcionais ausentes são omitidos do JSON** (`undefined` não
  serializa), nunca enviados como `null` — a API rejeita `null` onde espera
  objeto.
- **Env é lido dentro da função**, não no top-level do módulo.
- **`simulatePixPayment` não checa `NODE_ENV`** de propósito — a guarda de
  ambiente (404 em produção) pertence à rota.
- O provider **não toca o banco**: traduz o mundo externo em tipos nossos e
  devolve. Quem persiste é o resto do core. A fronteira da regra 2 do
  `PACKAGES.md` continua valendo, agora como fronteira de *pasta*.

### Outros

- `getPendingCharge` inclui `expires_at IS NULL` ("sem expiração conhecida") de
  propósito: o provedor é a fonte da verdade sobre o prazo, e descartar uma
  cobrança que talvez esteja válida faria o usuário pagar duas vezes.
- `safeEqual` **não lança**: `timingSafeEqual` exige buffers do mesmo tamanho
  (`RangeError` caso contrário), que é justamente o caso mais comum de secret
  errado. Comprimento diferente já é "não confere" — vaza só o tamanho.
- `toPixCharge` omite `user_id` e `abacate_charge_id` de propósito.
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
    ├── createMockDb.ts     # Db de mentira
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
- **Não mocke funções deste package.** Mocke as bordas: `db` (injetado) e
  `fetch` (global). `markChargePaidAndActivate` é testada de ponta a ponta
  contra um `db` de mentira, não com `getActivePlan` mockado — senão o teste
  para de provar a regra e passa a provar a chamada.
- **Cobertura 100%** (statements/branches/functions/lines), com `src/index.ts`
  fora da conta por ser só re-export. Threshold que não é 100 vira 99, depois
  95: o piso só significa alguma coisa enquanto for o teto.
- **Snapshot no SQL**, não no resultado inteiro: as queries são o contrato com
  o banco, e uma mudança silenciosa de `WHERE` é exatamente o que passa
  despercebido numa review.
- Roteie leituras por trecho de SQL (`sql.includes('FROM plans')`) em vez de
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
- `POST /api/subscriptions` — 400 planId inválido; 404 plano inexistente **ou
  inativo** (indistinguíveis de propósito); 409 `ALREADY_SUBSCRIBED`; 503
  `BILLING_NOT_CONFIGURED` sem `ABACATEPAY_API_KEY`; 502
  `PAYMENT_PROVIDER_ERROR`. Reaproveita cobrança PENDING não expirada do mesmo
  plano em vez de gerar um segundo QR Code (convite a pagar duas vezes). A
  cobrança é criada no provedor **antes** do INSERT porque só a resposta traz o
  `abacate_charge_id`; risco aceito abaixo.
- `GET /api/subscriptions/me` — sempre 200. `active` com período vencido é
  reportado como `expired` **computado na leitura, sem gravar** (um GET que
  escreve viraria corrida com a ativação).
- `GET /api/pix-charges/:id` — id LOCAL. PAID local não consulta o provedor.
  Falha do provedor → **200** com estado local + `providerUnavailable: true`
  (mesmo espírito do `quotesUnavailable`: polling não pode explodir por blip).
- `POST /api/billing/simulate/:chargeId` — atalho de dev. Em
  `NODE_ENV=production` responde **404, não 403**: 403 confirmaria que existe um
  endpoint capaz de ativar assinatura sem pagamento.

## Webhook

`POST /api/webhooks/abacatepay`, sem sessão. **Montado antes de
`app.use(express.json())`** em `api/index.ts` — o json global consome o stream e
marca `req._body`, o que faria o `express.raw` do router ser pulado e o HMAC ser
calculado sobre um corpo reserializado (quebra silenciosa: 401 em todo evento
legítimo). Essa linha não pode descer.

Ordem do handler: secret ausente no env → 401 (**fail-closed**); `?webhookSecret`
via `safeEqual` → 401; HMAC-SHA256 hex do Buffer contra `x-webhook-signature`
(aceita prefixo `sha256=`, header ausente é 401 — validação dupla obrigatória) →
401; JSON inválido → 400; evento fora de `transparent.completed` /
`checkout.completed` → **200 `ignored`** (4xx/5xx faria reentrega eterna);
idempotência por `INSERT OR IGNORE` em `billing_webhook_events` (`event_id`, com
fallback `` `${event}:${chargeId}` ``) → 200 `duplicate`; então
`markChargePaidAndActivate`. Cobrança desconhecida → 200 `unknownCharge`. Erro
de banco **não** é capturado: 500 faz o provedor reentregar, que é o desejável.

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
  expense-entries, recurring-expenses, savings, goals, budgets.
- **Onde NÃO está** (de propósito): auth, plans, subscriptions, pix-charges,
  billing/simulate, webhooks (senão o usuário não conseguiria comprar), leitura
  (portfolio, benchmarks, snapshots, tickers), admin e **wallets** — o `POST`
  de wallets é o lazy-create do onboarding e bloquear ele travaria o usuário
  antes de ele conseguir pagar.

## UI (T-072, no `web`)

Rota `/planos`: vitrine com preço em BRL (`Intl.NumberFormat`), painel Pix (QR
`brCodeBase64` + copia-e-cola `br_code`) com contagem regressiva, polling de
`GET /api/pix-charges/:id` a cada ~2s com backoff até 30s, redirect global em
402 `SUBSCRIPTION_REQUIRED`, banner de staging quando `billingEnabled: false` e
botão "Simular pagamento" só em `import.meta.env.DEV`.

Lógica pura vive em `web/src/routes/planos.ts` com testes ao lado; componentes
só renderizam.

## Risco aceito: cobrança órfã

Se o `INSERT` em `pix_charges` falhar depois de a cobrança ter sido criada no
provedor, ela fica órfã. Aceito porque (a) é raro, (b) não causa prejuízo — o
cliente nunca recebeu o QR, (c) se alguém pagar, o webhook responde
`200 unknownCharge` sem ativar nada, (d) os logs da AbacatePay permitem
reconciliação manual. A alternativa (gravar antes) é igualmente riscada: só a
resposta do provedor traz o `abacate_charge_id`.

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
