import { withRetry } from 'src/withRetry';

describe('withRetry', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devolve o valor da primeira tentativa sem esperar nem avisar (defaults)', async () => {
    const fn = jest.fn(async () => 'ok');

    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('tenta de novo depois de uma falha e devolve o sucesso seguinte', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls === 1) throw new Error('falhou');
      return 42;
    };

    await expect(withRetry(fn, 3, 1)).resolves.toBe(42);
    expect(calls).toBe(2);
    expect(console.warn).toHaveBeenCalledWith('[snapshots] Attempt 1/3 failed, retrying in 1ms');
  });

  it('esgotadas as tentativas, relança o ÚLTIMO erro e não espera depois da última', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      throw new Error(`falha ${calls}`);
    };

    await expect(withRetry(fn, 3, 1)).rejects.toThrow('falha 3');
    expect(calls).toBe(3);
    // Backoff linear (1ms × tentativa) só ENTRE tentativas: 2 avisos para 3 tentativas.
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenLastCalledWith(
      '[snapshots] Attempt 2/3 failed, retrying in 2ms'
    );
  });
});
