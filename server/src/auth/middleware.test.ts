import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, requireAdmin } from './middleware';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../db', () => ({
  db: { execute: vi.fn() },
}));

vi.mock('./service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./service')>();
  return { ...actual };
});

import { db } from '../db';
const mockExecute = vi.mocked(db.execute);

function makeReq(userId?: number): Request {
  return { session: { userId } } as unknown as Request;
}

function makeRes(locals: Record<string, unknown> = {}): {
  res: Response;
  locals: Record<string, unknown>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, locals, json } as unknown as Response;
  return { res, locals, status, json };
}

beforeEach(() => vi.clearAllMocks());

// ── requireAuth ───────────────────────────────────────────────────────────────

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

// ── requireAdmin ──────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('calls next() when user has admin role', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ roles: '["admin"]' }],
    } as never);
    const req = {} as Request;
    const { res } = makeRes({ userId: 1 });
    const next = vi.fn() as unknown as NextFunction;

    await new Promise<void>((resolve) => {
      (next as ReturnType<typeof vi.fn>).mockImplementation(resolve);
      requireAdmin(req, res, next);
    });

    expect(next).toHaveBeenCalledWith();
  });

  it('returns 403 when user does not have admin role', async () => {
    mockExecute.mockResolvedValue({ rows: [{ roles: '[]' }] } as never);
    const req = {} as Request;
    const { res, status, json } = makeRes({ userId: 2 });
    const next = vi.fn() as unknown as NextFunction;

    await new Promise<void>((resolve) => {
      (status as ReturnType<typeof vi.fn>).mockReturnValue({ json: vi.fn().mockImplementation(resolve) });
      requireAdmin(req, res, next);
    });

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when roles column is null/missing', async () => {
    mockExecute.mockResolvedValue({ rows: [{ roles: null }] } as never);
    const req = {} as Request;
    const { res, status, json } = makeRes({ userId: 3 });
    const next = vi.fn() as unknown as NextFunction;

    await new Promise<void>((resolve) => {
      (status as ReturnType<typeof vi.fn>).mockReturnValue({ json: vi.fn().mockImplementation(resolve) });
      requireAdmin(req, res, next);
    });

    expect(status).toHaveBeenCalledWith(403);
    expect(json).not.toHaveBeenCalled();
  });

  it('calls next(err) when db.execute throws', async () => {
    const dbErr = new Error('db error');
    mockExecute.mockRejectedValue(dbErr);
    const req = {} as Request;
    const { res } = makeRes({ userId: 1 });
    const next = vi.fn() as unknown as NextFunction;

    await new Promise<void>((resolve) => {
      (next as ReturnType<typeof vi.fn>).mockImplementation(resolve);
      requireAdmin(req, res, next);
    });

    expect(next).toHaveBeenCalledWith(dbErr);
  });
});
