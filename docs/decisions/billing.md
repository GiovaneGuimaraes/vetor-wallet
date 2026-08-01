# Billing / assinatura Pix (AbacatePay)

Schema em `db/schema.ts` (T-069, tabelas `plans`, `subscriptions`, `pix_charges`,
`billing_webhook_events`), client HTTP em `api/services/abacatepay.ts` (T-069),
regras e rotas em `api/services/billing.ts` + `api/routes/{plans,subscriptions,pixCharges,billingSimulate,webhooks}.ts`
(T-070).

## Unidade e datas

- **Dinheiro em CENTAVOS** neste domínio (`price_cents`, `amount_cents`) — é a
  unidade da AbacatePay. Todo o resto do app usa reais. Formatar é papel da UI.
- **Todo instante gravado sai de `toSqliteUtc`** (`'YYYY-MM-DD HH:MM:SS'`, UTC).
  Nunca `toISOString()` cru: o banco compara `current_period_end`/`expires_at`
  com `datetime('now')` e a comparação é lexicográfica — um `T` no meio faria
  qualquer data parecer futura. `toSqliteUtcFromProvider` normaliza o ISO que
  vem da AbacatePay antes do INSERT.
- `addInterval` soma o período em UTC com **clamp de dia** (31/01 → 28/02,
  29/02 → 28/02 no ano seguinte).
- `renewalBase(agora, fim vigente)` = o maior dos dois: renovar antes de vencer
  soma ao que resta; renovar depois conta de agora.

## Ativação: uma porta só

`markChargePaidAndActivate(abacateChargeId)` é a **única** função que ativa
assinatura. Webhook, polling (`GET /api/pix-charges/:id`) e a rota de simulação
chamam ela. É idempotente por dois mecanismos combinados:

1. `UPDATE pix_charges ... WHERE abacate_charge_id = ? AND status <> 'PAID'`;
2. `INSERT ... ON CONFLICT(user_id) DO UPDATE` da assinatura, num único
   `db.batch([...], 'write')` (transação) com a cobrança.

Consequência desejada: webhook e polling concorrentes não somam período duas
vezes. O dono da assinatura é **sempre `pix_charges.user_id`** — nunca
`metadata.userId` do payload, que é dado de fora.

Casos travados: cobrança expirada paga tarde **ativa** (o dinheiro entrou);
plano desativado depois da compra **ativa** (`getActivePlan` não filtra
`active`, de propósito); assinatura vencida comprando de novo é permitida.

## Rotas

- `GET /api/plans` — só `active = 1`, mais barato primeiro. **Única rota de dados
  sem filtro por `user_id`**: `plans` é catálogo global, sem coluna de dono.
- `POST /api/subscriptions` — 400 planId inválido; 404 plano inexistente **ou
  inativo** (indistinguíveis de propósito); 409 `ALREADY_SUBSCRIBED`; 503
  `BILLING_NOT_CONFIGURED` sem `ABACATEPAY_API_KEY`; 502
  `PAYMENT_PROVIDER_ERROR`. Reaproveita cobrança PENDING não expirada do mesmo
  plano em vez de gerar um segundo QR Code (convite a pagar duas vezes). A
  cobrança é criada no provedor **antes** do INSERT porque só a resposta traz o
  `abacate_charge_id`; risco aceito: INSERT falho deixa cobrança órfã no
  provedor, inofensiva (ninguém recebe o QR; se paga, o webhook responde
  `unknownCharge`).
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

## Env

`ABACATEPAY_API_KEY`, `ABACATEPAY_API_URL`, `ABACATEPAY_WEBHOOK_SECRET`,
`BILLING_ENABLED` (`'true'` liga; exposto em `GET /api/subscriptions/me` como
`billingEnabled` para a UI esconder a oferta).
