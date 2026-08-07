# Billing / assinatura Pix (AbacatePay)

> **Movido.** As decisões deste domínio vivem agora em
> [`packages/billing-core/CLAUDE.md`](../../packages/billing-core/CLAUDE.md)
> (T-099b, Ciclo 19 — arquitetura em módulos). Leia lá antes de mexer no módulo
> Billing: unidade em centavos, datas UTC no formato SQLite,
> `markChargePaidAndActivate` como única porta de ativação, rotas, webhook,
> gating (T-071), UI de planos (T-072) e guia de staging/produção.

Ver também [`packages/abacatepay-core/CLAUDE.md`](../../packages/abacatepay-core/CLAUDE.md)
(client HTTP do provedor) e [`db-schema.md`](./db-schema.md) (tabelas `plans`,
`subscriptions`, `pix_charges`, `billing_webhook_events`).
