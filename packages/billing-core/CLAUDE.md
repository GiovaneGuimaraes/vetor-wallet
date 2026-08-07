# CLAUDE.md — @vetor-wallet/billing-core

Regras de assinatura/cobrança Pix do Vetor Wallet (T-069/T-070/T-071) — a parte
que decide **data** e **ativação**. Extraído de
`packages/server/src/api/services/billing.ts` na T-099b (Ciclo 19 — arquitetura
em módulos). Categoria **Core**, módulo **Billing** (ver `docs/MODULES.md`/
`docs/PACKAGES.md`). É dono das tabelas `plans`, `subscriptions`, `pix_charges`
e por isso importa `@vetor-wallet/db` — "Core" é *dono das regras/dados do
domínio*, não *nunca faz I/O*.

Este arquivo substitui `docs/decisions/billing.md` (hoje um stub apontando para
cá) e cobre o módulo Billing inteiro: o que vive aqui, o que vive no
`abacatepay-core`, nas rotas do `server` e na UI do `web`.

## Estrutura

```
src/
├── billing.ts  # datas (toSqliteUtc, toSqliteUtcFromProvider, addInterval,
│               # renewalBase, nowSqliteUtc), estado (isSubscriptionActive,
│               # isBillingEnabled), projeções (toPlan/toSubscription/
│               # toPixCharge), leitura (getActivePlan, getSubscriptionRow,
│               # getPendingCharge), ativação (markChargePaidAndActivate),
│               # safeEqual (HMAC do webhook)
└── index.ts    # barrel
```

Schema das tabelas: `packages/db/src/schema.ts` (T-069). Client HTTP do
provedor: `@vetor-wallet/abacatepay-core` (T-098). Rotas:
`packages/server/src/api/routes/{plans,subscriptions,pixCharges,billingSimulate,webhooks}.ts`.
Gating: `packages/server/src/api/middleware/requireActiveSubscription.ts`.

## Invariantes (não quebrar)

### Unidade e datas

- **Dinheiro em CENTAVOS** neste domínio (`price_cents`, `amount_cents`) — é a
  unidade da AbacatePay. Todo o resto do app usa reais. Formatar é papel da UI.
- **Todo instante gravado sai de `toSqliteUtc`** (`'YYYY-MM-DD HH:MM:SS'`, UTC).
  Nunca `toISOString()` cru: o banco compara `current_period_end`/`expires_at`
  com `datetime('now')` e a comparação é lexicográfica — um `T` no meio faria
  qualquer data parecer futura (o `T` é maior que qualquer dígito).
  `toSqliteUtcFromProvider` normaliza o ISO que vem da AbacatePay antes do
  INSERT; entrada inválida vira `null` ("sem expiração conhecida"), nunca
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

`markChargePaidAndActivate(abacateChargeId)` é a **única** função que ativa
assinatura. Webhook, polling (`GET /api/pix-charges/:id`) e a rota de simulação
chamam ela. É idempotente por dois mecanismos combinados:

1. `UPDATE pix_charges ... WHERE abacate_charge_id = ? AND status <> 'PAID'`;
2. `INSERT ... ON CONFLICT(user_id) DO UPDATE` da assinatura, num único
   `db.batch([...], 'write')` (transação) com a cobrança.

Consequência desejada: webhook e polling concorrentes não somam período duas
vezes — a segunda chamada responde `activated: false`. O dono da assinatura é
**sempre `pix_charges.user_id`** — nunca `metadata.userId` do payload, que é
dado de fora e daria a quem forjasse um webhook a chance de ativar a assinatura
de outra pessoa.

Casos travados: cobrança expirada paga tarde **ativa** (o dinheiro entrou);
plano desativado depois da compra **ativa** (`getActivePlan` não filtra
`active`, de propósito — senão a assinatura de um plano descontinuado apareceria
sem nome); assinatura vencida comprando de novo é permitida.

### Outros

- `getPendingCharge` inclui `expires_at IS NULL` ("sem expiração conhecida") de
  propósito: o provedor é a fonte da verdade sobre o prazo, e descartar uma
  cobrança que talvez esteja válida faria o usuário pagar duas vezes.
- `safeEqual` **não lança**: `timingSafeEqual` exige buffers do mesmo tamanho
  (`RangeError` caso contrário), que é justamente o caso mais comum de secret
  errado. Comprimento diferente já é "não confere" — vaza só o tamanho, que não
  é segredo.
- `toPixCharge` omite `user_id` e `abacate_charge_id` de propósito: o primeiro é
  redundante (a rota já é do usuário logado), o segundo é identificador do
  provedor, que só o webhook precisa conhecer.
- **Não importa `express`** nem nada de `server`/`web` (regra 1 de
  `docs/PACKAGES.md`). O gating HTTP (`requireActiveSubscription`) é middleware
  Express e fica no `server`, importando `isBillingEnabled`,
  `getSubscriptionRow`, `isSubscriptionActive` e `nowSqliteUtc` daqui.
- **Hoje não importa `@vetor-wallet/abacatepay-core`**: são as rotas que
  orquestram o client HTTP. A regra 3 de `docs/PACKAGES.md` prevê que essa
  orquestração venha para cá um dia; enquanto não vier, a dependência não
  existe (e o inverso — `abacatepay-core` importar este package — é proibido).

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
  `expires_at` NULL = sem expiração conhecida: não expira localmente nem é
  descartada no reaproveitamento.
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

## T-072 — UI de planos e pagamento Pix (no `web`)

Rota `/planos` com:
- **Vitrine de planos**: cards com preço em BRL (formatado via `Intl.NumberFormat`),
  intervalo (/mês, /ano), descrição e botão "Assinar".
- **Painel Pix**: após clicar "Assinar", exibe QR Code (`brCodeBase64` + `br_code`
  para copia-e-cola) + contagem regressiva de expiração (polling do `expires_at`).
- **Polling com backoff**: `GET /api/pix-charges/:id` a cada ~2s, com backoff
  exponencial até 30s. Ao receber PAID, ativa a assinatura (transitivo: não
  precisa re-GET `/subscriptions/me`, a UI já sabe).
- **402 global → redirect**: quando uma rota responde 402
  `{code:'SUBSCRIPTION_REQUIRED'}`, middleware de rota redireciona para `/planos`
  (convite implícito a pagar).
- **Banner de staging**: quando `billingEnabled: false`, a página exibe aviso de
  que nenhum pagamento será processado (staging/dev).
- **Botão "Simular pagamento"** (dev only): disponível apenas quando
  `import.meta.env.DEV`, chama `POST /api/billing/simulate/:chargeId` (T-070)
  para ativar uma cobrança sem passar pelo Pix real. Desaparece em produção.

Lógica pura (parsing, polling, estado de UI, formatação) vive em
`web/src/routes/planos.ts` com testes ao lado; componentes são apenas
renderização.

## Guia de staging e produção

### Staging (local + CI)

Por padrão, `BILLING_ENABLED=false`:
- Middleware de gating vira no-op → sem bloqueio de 402, tudo funciona como se
  não houvesse billing.
- API de billing (`/api/plans`, `/api/subscriptions`, `/api/pix-charges`) continua
  funcionando (útil para testes automatizados).
- Se quiser **testar o fluxo Pix completo** sem pagar:
  1. Criar conta na [AbacatePay](https://www.abacatepay.com) em modo Dev (sandbox).
  2. Copiar API Key de sandbox e definir `ABACATEPAY_API_KEY` + `ABACATEPAY_API_URL`
     (que já tem default `https://api.abacatepay.com/v2`).
  3. Manter `BILLING_ENABLED=false` ou ativar com `=true` para ver o gating.
  4. Usar botão "Simular pagamento" na UI (`POST /api/billing/simulate/:chargeId`,
     disponível apenas em `NODE_ENV !== 'production'`) para marcar a cobrança
     como PAID sem Pix real.

### Produção

1. **Definir variáveis obrigatórias** no servidor:
   - `BILLING_ENABLED=true`
   - `ABACATEPAY_API_KEY=<chave de produção da AbacatePay>`
   - `ABACATEPAY_API_URL=https://api.abacatepay.com/v2` (pode omitir se usar default)
   - `ABACATEPAY_WEBHOOK_SECRET=<secret gerado pela AbacatePay>` (obrigatório para
     webhook)
   - `NODE_ENV=production`

2. **Registrar webhook** no dashboard da AbacatePay:
   - URL: `https://<seu-dominio>/api/webhooks/abacatepay?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>`
   - Eventos: `transparent.completed`, `checkout.completed` (cobrança paga)
   - O servidor valida HMAC-SHA256 (`x-webhook-signature`) + query secret dupla
     verificação obrigatória.

3. **Monitoramento**:
   - Middleware gating bloqueia gravações (POST/PATCH/DELETE) sem assinatura ativa
     → 402 `{code:'SUBSCRIPTION_REQUIRED'}`.
   - Cobrança órfã (INSERT falho após criar no provedor): monitorar
     `pix_charges` com `status = 'PENDING'` sem `user_id` correspondente ou com
     `created_at` antigo — nunca causa prejuízo (webhook responde `unknownCharge`),
     mas reduz ruído nos logs da AbacatePay.

## Risco aceito: cobrança órfã

Fluxo de assinatura:
1. `POST /api/subscriptions {planId}` chama `abacatepay.createPixCharge()` (rede).
2. Resposta traz `brCode`, `expiresAt`, `id` do provedor.
3. **Antes de 3 vir de fato:** se o `INSERT` em `pix_charges` falhar (DB travado,
   crash imediato…), a cobrança gerada no provedor fica órfã: ninguém tem o QR,
   se alguém paga, o webhook responde `200 unknownCharge` (idempotente).

Alternativa (criar before paying): ainda riscado — cobrança criada sem seu id no
provedor fica órfã igualmente.

**Decisão**: aceitar o risco porque (a) é raro, (b) não causa prejuízo (o cliente
já não recebeu um QR para pagar), (c) webhook é idempotente, (d) logs da
AbacatePay mostram eventos órfãos para reconciliação manual se necessário.

## Env

`ABACATEPAY_API_KEY`, `ABACATEPAY_API_URL` (default `https://api.abacatepay.com/v2`),
`ABACATEPAY_WEBHOOK_SECRET`, `BILLING_ENABLED` (default `false`; `'true'` ativa gating;
exposto em `GET /api/subscriptions/me` como `billingEnabled` para a UI esconder a oferta em staging).

## Convenções

- Teste ao lado do código (`src/**/*.test.ts`), Vitest. Teste que toca banco
  define `DATABASE_URL` **antes** do `await import('@vetor-wallet/db')` — o
  client lê o env no top-level do módulo.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência),
`docs/MODULES.md` (módulo Billing) e `packages/abacatepay-core/CLAUDE.md`.
