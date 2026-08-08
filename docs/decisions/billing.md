# Billing / assinatura Pix (AbacatePay)

> **Movido.** As decisões deste domínio vivem agora em
> [`packages/subscription-core/CLAUDE.md`](../../packages/subscription-core/CLAUDE.md)
> (T-099b, Ciclo 19; package renomeado de `billing-core` na T-103, Ciclo 20).
> Leia lá antes de mexer no módulo Subscriptions: unidade em centavos, datas UTC
> no formato SQLite, `markChargePaidAndActivate` como única porta de ativação,
> rotas, webhook, gating (T-071), UI de planos (T-072) e guia de
> staging/produção.

O client HTTP da AbacatePay deixou de ser package próprio na T-103 e virou
`packages/subscription-core/src/providers/abacatepay/` — Pix é forma de cobrar
uma assinatura, não domínio.

Ver também [`db-schema.md`](./db-schema.md) (tabelas `plans`, `subscriptions`,
`pix_charges`, `billing_webhook_events`).
