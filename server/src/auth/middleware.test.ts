import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from './middleware';
import type { Request, Response, NextFunction } from 'express';

function makeReq(userId?: number): Request {
  return { session: { userId } } as unknown as Request;
}

function makeRes(): { res: Response; locals: Record<string, unknown>; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const locals: Record<string, unknown> = {};
  const res = { status, locals } as unknown as Response;
  return { res, locals, status, json };
}

describe('requireAuth', () => {
  it('calls next() and sets res.locals.userId when session has userId', () => {
    const req = makeReq(42);
    const { res, locals } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(locals.userId).toBe(42);
  });

  it('returns 401 and does not call next() when session has no userId', () => {
    const req = makeReq(undefined);
    const { res, status, json } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Nao autenticado' });
  });
});
