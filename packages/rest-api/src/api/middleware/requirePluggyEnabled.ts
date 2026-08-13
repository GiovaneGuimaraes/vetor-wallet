import type { RequestHandler } from 'express';
import { isPluggyIntegrationEnabled } from '@vetor-wallet/pluggy-core';

/**
 * Gate de ambiente da integração Pluggy (T-089b).
 *
 * A regra (`ENVIRONMENT=Staging` libera, todo o resto bloqueia, fail closed)
 * vive em `@vetor-wallet/pluggy-core`; aqui fica só a tradução para HTTP —
 * mesmo arranjo de `isBillingEnabled()` × `requireActiveSubscription`.
 *
 * **O gate vive na ROTA, não na UI.** Esconder o botão é UX; um botão escondido
 * não bloqueia ninguém que chame a API direto. O `GET /api/pluggy/status` é a
 * única rota do router que NÃO passa por aqui: é justamente ela que conta ao web
 * se a integração está ligada, e gateá-la faria o cliente não ter como saber o
 * que exibir sem uma segunda cópia da flag em `VITE_*` — a duplicação que a
 * decisão do humano proíbe.
 *
 * `403`, não `404`: não há nada a esconder aqui. A integração existe, tem
 * documentação pública e simplesmente não está liberada neste ambiente. `404`
 * mandaria o cliente procurar bug de rota inexistente.
 */
export const requirePluggyEnabled: RequestHandler = (_req, res, next) => {
  if (isPluggyIntegrationEnabled()) {
    next();
    return;
  }
  res.status(403).json({
    error: 'A integração com o Open Finance não está disponível neste ambiente',
    code: 'PLUGGY_DISABLED',
  });
};
