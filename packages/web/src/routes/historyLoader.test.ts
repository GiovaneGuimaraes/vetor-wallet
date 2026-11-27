import { describe, expect, it } from 'vitest';
import { createHistoryLoader } from './historyLoader';

/** Promise controlável de fora (o teste decide quando cada fetch termina). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createHistoryLoader', () => {
  it('mesma Promise para o mesmo ticker dentro do TTL; refaz depois do TTL', async () => {
    let t = 0;
    const calls: string[] = [];
    const loader = createHistoryLoader(
      async (x: string) => {
        calls.push(x);
        return x.toLowerCase();
      },
      { concurrency: 2, ttlMs: 100, now: () => t }
    );
    const a = loader.load('PETR4');
    expect(loader.load('PETR4')).toBe(a);
    await expect(a).resolves.toBe('petr4');
    t = 101;
    await loader.load('PETR4');
    expect(calls).toEqual(['PETR4', 'PETR4']);
  });

  it('erro não fica em cache', async () => {
    let fail = true;
    let n = 0;
    const loader = createHistoryLoader(
      async () => {
        n++;
        if (fail) throw new Error('x');
        return 1;
      },
      { concurrency: 1, ttlMs: 1000 }
    );
    await expect(loader.load('A')).rejects.toThrow('x');
    await flush();
    fail = false;
    await expect(loader.load('A')).resolves.toBe(1);
    expect(n).toBe(2);
  });

  it('nunca passa do limite de concorrência e atende na ordem pedida', async () => {
    const pending = new Map<string, ReturnType<typeof deferred<string>>>();
    const started: string[] = [];
    const loader = createHistoryLoader(
      (x: string) => {
        started.push(x);
        const d = deferred<string>();
        pending.set(x, d);
        return d.promise;
      },
      { concurrency: 2, ttlMs: 1000 }
    );
    const all = ['A', 'B', 'C', 'D'].map((x) => loader.load(x));
    await flush();
    expect(started).toEqual(['A', 'B']);

    pending.get('A')!.resolve('a');
    await flush();
    expect(started).toEqual(['A', 'B', 'C']);

    pending.get('B')!.reject(new Error('falhou'));
    await flush();
    expect(started).toEqual(['A', 'B', 'C', 'D']);

    pending.get('C')!.resolve('c');
    pending.get('D')!.resolve('d');
    const results = await Promise.allSettled(all);
    expect(results.map((r) => r.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
      'fulfilled',
    ]);
  });

  it('reset limpa o cache', async () => {
    let n = 0;
    const loader = createHistoryLoader(async () => ++n, { concurrency: 1, ttlMs: 1000 });
    await loader.load('A');
    loader.reset();
    await expect(loader.load('A')).resolves.toBe(2);
  });
});
