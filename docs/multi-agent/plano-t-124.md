# Plano T-124 — Assinatura recorrente no cartão (AbacatePay) + cliente

Resultado do spike de design (agente `Plan`, Opus, 2026-11-09), revisto pelo orquestrador contra a API real
(dev mode). **Cada fatia lê este arquivo e o `packages/subscription-core/CLAUDE.md` antes de codar.**
Nenhum valor real (e-mail, key, saldo) entra aqui — o repo é público.

## Decisões do humano (2026-11-09) — não rediscutir

1. **Só cartão recorrente.** Sai o Pix de assinatura: a loja não tem Pix Automático (a API responde
   `PIX Automático is not available for this store`).
2. **Cliente** criado na AbacatePay só com e-mail + nome (sem CPF/celular), **só na assinatura**.
   Pix avulso com cliente exigiria nome, CPF/CNPJ e celular — fora.
3. **Sem deploy público** → reconciliar **consultando a API**; o webhook `subscription.*` vem depois.
4. **Cancelar** = acesso até o fim do período já pago; cancelar pelo portal da AbacatePay (sem botão de
   cancelar no app por ora).
5. **Pix legado** (quem já pagou por Pix) segue valendo até o fim do período, não renova, e só pode
   assinar no cartão **depois de vencer** (antes: 409 `ALREADY_SUBSCRIBED`).
6. **Assinatura duplicada** (duas de cartão pagas por corrida): cancelar a mais nova pela API e registrar
   o reembolso a fazer. (Em runtime a API não escreve arquivo do repo: o aviso ao humano é o log
   `billing.subscription.duplicate` — e `duplicate_cancel_unconfirmed` (error) se a releitura não
   confirmar `CANCELLED`. O humano acompanha pelo log.)
7. Remoção do Pix = **etapa 1** da migração destrutiva: sai da UI e da API, **sem dropar** `pix_charges`.
   O DROP é tarefa futura, com dump fora do repo e confirmação.

## Fatos da API v2 verificados (dev mode, 2026-11-09)

- `POST /customers/create {email,name}` funciona sem CPF; único por CPF/CNPJ (sem ele, repetir duplica →
  guardar o `cust_…` do nosso lado).
- `POST /products/create {externalId,name,price,currency:'BRL',cycle}`; `externalId` repetido → **400**
  `Product with externalId already exists`; `GET /products/get?externalId=` e `/products/list?externalId=`
  encontram (é como se recupera de corrida). Nome aceita acento/travessão/130+ chars. Delete **arquiva**.
- `POST /subscriptions/create {items:[{id,quantity:1}],customerId,externalId,methods:['CARD'],completionUrl,returnUrl}`
  → checkout `bill_…` com `url` hospedada. A assinatura `subs_…` só existe **depois** do pagamento.
  `completionUrl` com `http://localhost` é aceita. `POST /subscriptions/checkouts/delete?id=bill_…` apaga um
  checkout aberto.
- `GET /subscriptions/get?id=` (inexistente → 400 `Subscription not found`); `GET /subscriptions/list?checkoutId=`
  (antes de pagar → `data: []`); `POST /subscriptions/cancel {id}` (cancela **na hora**);
  `POST /customer-portal/create {customerId,checkoutId}` → `{url}` (cancelamento pelo portal é no fim do ciclo).
- Ciclos: `MONTHLY`, `ANNUALLY` (+ outros). `description` de **cobrança Pix** tem máx. 140 (nosso corte é 80).
- **Não** há simulação de pagamento/renovação de assinatura em dev. Cartão de teste na página hospedada:
  `4242 4242 4242 4242`, qualquer validade futura/CVV.
- Eventos de webhook: `subscription.completed|trial_started|renewed|payment_failed|cancelled|plan_changed`.
  Só o payload de `trial_started` está documentado (`data.subscription{id,amount,status,method,...}`) → ler
  **defensivamente**. `subscription.cancelled` pode trazer `cancelledDueTo: max_payment_retries_exceeded`.

## A. Modelo de dados (`packages/db/src/schema.ts`; dono: subscription-core; não destrutivo)

- `billing_customers`: `user_id` UNIQUE, `abacate_customer_id` UNIQUE (fora de `users`, que é do auth-core).
- `plans` + `abacate_product_id`, `abacate_product_price_cents` (NULLable; detecta preço mudado).
- `subscription_checkouts` (papel do `pix_charges`; **o dono vem daqui, nunca do payload**): `status` em
  `CREATING|OPEN|COMPLETED|SUPERSEDED|FAILED`; UNIQUE parcial `abacate_checkout_id WHERE NOT NULL`; UNIQUE
  parcial `(user_id) WHERE status IN ('CREATING','OPEN')`. A linha local nasce **antes** da chamada ao
  provedor (`externalId = checkout:<id local>`) — some o risco da "cobrança órfã" do Pix.
- `subscriptions` + `provider` (`pix_legacy`|`abacatepay_card`; nulo = Pix legado),
  `abacate_subscription_id` (UNIQUE parcial), `provider_status`, `canceled_at`, `last_synced_at`.
  **Não** mexer no `CHECK` de `status` (recriar a tabela no SQLite é destrutivo).
- Mapeamento: checkout aberto → `pending` (nunca rebaixa `active` no período); `ACTIVE`/`completed`/`renewed`
  → `active`; `payment_failed` → segue `active` com `provider_status='PAYMENT_FAILED'` (expira sozinho no fim
  do período); `CANCELLED` → `canceled` + `canceled_at`; `PENDING`/`FAILED`/desconhecido → só `provider_status`.
- `isSubscriptionActive` passa a aceitar `canceled` com `current_period_end` no futuro (decisão 4).
- `current_period_end` (o provedor não devolve): ativação `addInterval(renewalBase(agora, fim antigo), interval)`;
  renovação ancorada no fim anterior; se `getSubscription` trouxer data de próxima cobrança (nome não
  documentado) e for válida/futura, ela vence. `monthly → MONTHLY`, `yearly → ANNUALLY`.

## B. Provider (`subscription-core/src/providers/abacatepay/`, 1 função/arquivo, 100% de cobertura)

`toAbacateCycle`, `createCustomer`, `createProduct`, `getProductByExternalId` (null só para "não existe"),
`createSubscriptionCheckout`, `AbacateSubscription` (mapeador **defensivo**, nunca lança por campo faltando),
`getSubscription`, `listSubscriptionsByCheckout` (lista vazia é válida), `cancelSubscription`,
`createCustomerPortal`, `archiveProduct`; e (fatia d) `parseSubscriptionWebhook`.

## C. Regra de negócio — UMA porta (subscription-core, `query` injetado)

- `ensureBillingCustomer` (existe → devolve; senão cria e `INSERT … ON CONFLICT(user_id) DO NOTHING`; `rowCount`
  0 = perdeu a corrida, relê).
- `ensurePlanProduct` (preço bate → devolve; senão `getProductByExternalId` → senão `createProduct`; 400 de
  `externalId` duplicado → relê por `externalId`; grava com UPDATE condicional).
- `startCardCheckout` (descarta `CREATING` com >2 min; reaproveita `OPEN` do mesmo plano; outro plano →
  `SUPERSEDED`; insere `CREATING` — índice único recusa → `CheckoutInProgressError`; cria cliente/produto/
  checkout; `OPEN`; UPSERT de `subscriptions` em `pending` sem rebaixar `active`; falha do provedor → `FAILED`).
  Erros tipados, um arquivo cada: `AlreadySubscribedError`, `CheckoutInProgressError`.
- **`applyProviderSubscriptionState({ref:{checkoutId}|{subscriptionId}, transition, snapshot, nowIso})`** com
  `activate|renew|payment_failed|cancel|plan_changed`. Dono sempre do nosso banco. **Decide por `rowCount` do
  UPDATE condicional, nunca por SELECT antes** (a `markChargePaidAndActivate` atual tem corrida: lê, depois
  UPDATE/UPSERT sem olhar `rowCount`; esta porta NÃO copia esse padrão). `activate`: `UPDATE
  subscription_checkouts … WHERE abacate_checkout_id=$1 AND status<>'COMPLETED'` → só continua com `rowCount=1`.
  `renew`: UPDATE sobre o próprio fim do período (`WHERE current_period_end=$antigo AND current_period_end <=
  agora+janela de ~3 dias`) → webhook e consulta não estendem duas vezes.
- `reconcileCardSubscription({userId, nowIso, minIntervalSeconds})`: throttling por UPDATE condicional em
  `last_synced_at` (~10 s com checkout aberto, ~300 s nos demais); checkout `OPEN` sem `subs_` →
  `listSubscriptionsByCheckout` (se `ACTIVE` → `activate`); com `subs_` → `getSubscription` (`CANCELLED` →
  `cancel`; `ACTIVE` com fim do período dentro da janela → `renew` deduzida). Falha do provedor →
  `{providerUnavailable:true}`, **nunca lança**.
- Duplicada (decisão 6): `activate` que achar outro `subs_` ativo do mesmo usuário loga
  `billing.subscription.duplicate`, cancela a mais nova pela API, relê `getSubscription` para provar o
  cancelamento (a API pode devolver `data:null` no cancel) e loga; sem escrita em arquivo.

## D. Rotas (rest-api)

- `POST /api/subscriptions {planId}` → **201** `{subscription, checkout:{id,url}}`. 400 planId; 404 plano
  inexistente/inativo (indistinguíveis); 409 `ALREADY_SUBSCRIBED` (inclui Pix legado no período); 409
  `CHECKOUT_IN_PROGRESS`; 503 `BILLING_NOT_CONFIGURED`; 502 `PAYMENT_PROVIDER_ERROR` (loga
  `billing.checkout.failed` com `providerStatus`). E-mail/nome vêm do auth-core (a rota cruza os módulos); nome
  vazio → parte do e-mail antes do `@`. `completionUrl`/`returnUrl` montadas **só do env** (`ALLOWED_ORIGIN` +
  `/planos?checkout=completed|returned`), nunca da requisição (redirect aberto).
- `POST /api/subscriptions/sync` (200 = `/me` + `providerUnavailable?`; grava só pela porta).
- `GET /api/subscriptions/me` **continua só leitura** (um GET que grava vira corrida com a ativação — regra
  do core); troca `pendingCharge` por `pendingCheckout:{url,plan_id,created_at}|null`; `Subscription` ganha
  `provider`, `provider_status`, `canceled_at`.
- `POST /api/subscriptions/portal` → `{url}`; 404 `NO_CARD_SUBSCRIPTION` sem cliente na AbacatePay.
- Saem do `index.ts` `/api/pix-charges` e `/api/billing/simulate`, e do core `createPixCharge`, `checkPixCharge`,
  `simulatePixPayment`, `getPendingCharge`, `toPixCharge` (com testes). **Ficam** `markChargePaidAndActivate`
  e `transparent.completed` no webhook (QR emitido antes do deploy ainda ativa); saem na etapa 2.
- `requireActiveSubscription` não muda (herda a nova `isSubscriptionActive`); rotas novas ficam fora do gate.

## E. Web (`PlanosPage`)

"Assinar" → POST → `window.location.assign(checkout.url)`. Ao abrir `/planos` **sempre** chama `sync` (o
servidor faz o throttling); com `?checkout=completed` mostra "Confirmando pagamento…" com backoff até ~2 min e
limpa o parâmetro com `history.replaceState`. Estados (`subscriptionUiState`): none, pending_checkout
("Continuar pagamento"), confirming, active ("válido até X" + "Gerenciar assinatura" → portal),
canceled_with_access, payment_failed ("atualize o cartão" → portal), expired, legacy_pix ("não renova"), staging.
Sai: QR, copia-e-cola, contagem regressiva, polling de cobrança, "Simular pagamento". Fica: vitrine,
`yearlySavingsPercent`, banner de staging, redirect global do 402 (leva a `/planos`, e o `sync` ali conserta
renovação não vista). `ContaPage` mostra provedor/cancelamento. Teste de render novo (`PlanosPage.test.tsx`).

## F. Fatias (1 PR cada)

| Fatia | Conteúdo | Depende de | Complexidade / modelo |
|---|---|---|---|
| **124a** | Schema + provider (sem regra) | — | alta (schema) / Opus |
| **124b1** | Regra no core (C), `isSubscriptionActive`, erros tipados; testes de corrida; Stryker na porta | a | alta / Opus |
| **124b2** | Rotas `/sync`, `/portal`, campos novos em `/me` (o `pendingCharge` ainda fica) | b1 | média / Sonnet |
| **124c** | `POST /api/subscriptions` → cartão + web + remoção do Pix (1 PR: o tipo `CreateSubscriptionResponse` é compartilhado) | b2 | alta / Opus |
| **124d** | Webhook `subscription.*` e `bill_…` de `checkout.completed` chamando a porta | T-123, b1 | média / Sonnet |

**Evidência de fechamento da 124c** (conta de teste): assinar Pro Mensal em `/planos` → checkout hospedado →
pagar com `4242…` → voltar a `/planos?checkout=completed` → ativa. Colar `GET /me` e os logs
`billing.checkout.created`, `billing.customer.created`, `billing.subscription.activated`; conferir no painel da
AbacatePay cliente (sem CPF), produto e assinatura; assinar de novo → 409; trocar de plano reaproveita o mesmo
`cust_`; abrir o portal; `/api/pix-charges/1` → 404.

**Renovação NÃO é simulável em dev**: prova-se com fake do provider nos testes (b1) — `ACTIVE` com fim vencido →
estende; `CANCELLED` → cancela; `payment_failed` → expira no fim; renovação duplicada → nada acontece. O que só a
produção prova (registrar no `TODO-HUMANO.md`): a 1ª renovação real (~30 dias), o formato real do payload
`.renewed`, e se `ACTIVE` segue `ACTIVE` durante as tentativas de cobrança.

## G. Riscos que o revisor precisa checar

Ativação dupla (webhook + consulta): nenhum caminho calcula o período **antes** de vencer o `rowCount` do UPDATE
de `subscription_checkouts`. Cancelada com período pago: gate e `planBadge` precisam concordar. Troca de plano com
checkout antigo pago depois: o plano vem da linha do checkout. Pix legado ativo: 409 até expirar. Usuário sem nome.
Provedor cai no meio de `startCardCheckout` (linha `CREATING` >2 min é descartada). Cliente/produto duplicado por
corrida. Trial: não mandamos `trialDays`; `trial_started` só loga. Preço do plano mudado: produto novo, assinaturas
antigas ficam no antigo. `ALLOWED_ORIGIN` com lista separada por vírgula quebraria a `completionUrl` (testar com a
variável ausente → default `http://localhost:5173`). Testes roteiam leituras por trecho de SQL, não por ordem.

## H. Ainda em aberto (só a AbacatePay ou um teste real respondem)

Se `ACTIVE` continua `ACTIVE` durante as tentativas de cobrança e se `subscriptions/get` traz a próxima data de
cobrança (recomendação: deduzir a renovação de `ACTIVE`, preferir a data do provedor quando existir, aceitar a
perda de no máx. `retryPolicy` dias); validade de um checkout `bill_` aberto (recomendação: reaproveitar por 30
min, depois `SUPERSEDED` e apagar via `subscriptions/checkouts/delete`).
