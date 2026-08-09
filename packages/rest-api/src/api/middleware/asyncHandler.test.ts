import { describe, it, expect, vi } from 'vitest';
import { asyncHandler } from './asyncHandler';

describe('asyncHandler', () => {
  it('forwards a rejected promise to next() instead of hanging the request', async () => {
    const error = new Error('boom');
    const handler = asyncHandler(async () => {
      throw error;
    });
    const next = vi.fn();

    await handler({} as never, {} as never, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('does not call next() when the handler resolves normally', async () => {
    const handler = asyncHandler(async (_req, res) => {
      (res as unknown as { json: (v: unknown) => void }).json({ ok: true });
    });
    const next = vi.fn();
    const json = vi.fn();

    await handler({} as never, { json } as never, next);

    expect(json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });
});
