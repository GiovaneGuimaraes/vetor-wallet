import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { log } from '../logger';

/**
 * Uma linha `http.request` por request (T-122): método, rota, status,
 * `durationMs`, `requestId` e `userId` quando há sessão.
 *
 * - **`route` é o TEMPLATE** (`/api/operations/:id`), nunca a URL: query string
 *   e valores de params não entram. Barrada por middleware do router antes de
 *   casar a rota (ex.: 401), vira o prefixo de montagem (`/api/operations/*`);
 *   sem nenhum router, `unmatched` — a URL crua poderia carregar dado.
 * - O `requestId` também desce no header `X-Request-Id` e fica em
 *   `res.locals.requestId`, para os eventos de domínio da mesma request.
 * - Registra no `finish`, quando status e sessão já existem. Montar ANTES do
 *   `express.json()` e da sessão, para medir a request inteira.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Capturado quando a resposta começa: no `finish` o Express pode já ter
  // restaurado `req.baseUrl`/`req.route`.
  let route = 'unmatched';
  const writeHead = res.writeHead;
  res.writeHead = function (this: Response, ...args: unknown[]) {
    if (req.route) {
      const path = req.route.path === '/' ? '' : String(req.route.path);
      route = `${req.baseUrl}${path}` || '/';
    } else if (req.baseUrl) {
      // Barrado por middleware do router (ex.: `requireAuth` → 401) antes de
      // casar a rota: o prefixo de montagem é o que se sabe com segurança.
      route = `${req.baseUrl}/*`;
    }
    return (writeHead as (...a: unknown[]) => Response).apply(this, args);
  } as typeof res.writeHead;

  res.on('finish', () => {
    const userId = (res.locals.userId as number | undefined) ?? req.session?.userId;
    log('info', 'http.request', {
      requestId,
      method: req.method,
      route,
      status: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100,
      ...(typeof userId === 'number' ? { userId } : {}),
    });
  });
  next();
}
