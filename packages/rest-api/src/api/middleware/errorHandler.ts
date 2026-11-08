import { Request, Response, NextFunction } from 'express';
import { log } from '../logger';

/**
 * Erro não tratado → 500 + log estruturado (T-122). Do erro só saem o tipo
 * (`errorKind`), o `code` (string, quando há) e os FRAMES da stack: a `message`
 * e a primeira linha da stack podem carregar valores (SQL com argumento, corpo
 * da request).
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e = err as { name?: unknown; code?: unknown; stack?: unknown } | null;
  const frames =
    typeof e?.stack === 'string'
      ? e.stack
          .split('\n')
          .filter((l) => l.trimStart().startsWith('at '))
          .slice(0, 5)
          .map((l) => l.trim())
          .join(' | ')
      : undefined;
  log('error', 'http.unhandled_error', {
    requestId: res.locals.requestId as string | undefined,
    errorKind: typeof e?.name === 'string' ? e.name : typeof err,
    errorCode: typeof e?.code === 'string' ? e.code : undefined,
    frames,
  });
  if (res.headersSent) return;
  res.status(500).json({ error: 'Erro interno do servidor' });
}
