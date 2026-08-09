import type { RequestHandler } from 'express';
import { db } from '@vetor-wallet/db';
import {
  getSubscriptionRow,
  isBillingEnabled,
  isSubscriptionActive,
  nowSqliteUtc,
} from '@vetor-wallet/subscription-core';

/**
 * Gating de assinatura nas rotas de dados (T-071).
 *
 * Três decisões travadas moram aqui:
 *
 * 1. **Flag desligada é no-op literal.** Sem `BILLING_ENABLED=true` o
 *    middleware chama `next()` sem tocar o banco — staging (e todo o resto da
 *    suíte de testes, que não sabe de assinatura) não paga uma query por
 *    request. O default é "desligado": flag ausente conta como `false`.
 * 2. **Gating só em escrita.** `GET`/`HEAD`/`OPTIONS` passam sempre. É isso que
 *    permite montar o middleware com um único `router.use(...)` por router, sem
 *    enumerar handler por handler: quem não paga continua lendo os próprios
 *    dados (nada é sequestrado), só não grava mais.
 *    Efeito colateral aceito: a **materialização lazy das recorrências**
 *    (T-035) acontece dentro do `GET /api/expense-entries` e portanto segue
 *    livre para quem está sem assinatura. É coerente com "GETs livres" — a
 *    recorrência é dado que o usuário já criou quando pagava, e travá-la faria
 *    o histórico dele aparecer com buracos.
 * 3. **Erro de banco nunca libera.** Falha na consulta vira `next(err)` (500),
 *    não um `next()` por precaução: um banco intermitente não é licença para
 *    gravar.
 *
 * Roda SEMPRE depois de `requireAuth` — lê `res.locals.userId`.
 */
export const requireActiveSubscription: RequestHandler = (req, res, next) => {
  if (!isBillingEnabled()) {
    next();
    return;
  }

  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  const userId = res.locals.userId as number;

  getSubscriptionRow({ db, userId })
    .then((sub) => {
      if (isSubscriptionActive(sub, nowSqliteUtc())) {
        next();
        return;
      }
      res.status(402).json({
        error: 'Assinatura necessária para gravar dados',
        code: 'SUBSCRIPTION_REQUIRED',
      });
    })
    .catch(next);
};
