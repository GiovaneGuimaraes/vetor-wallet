import { withUserLock } from 'src/withUserLock';

/** Promise que só resolve quando o teste mandar — para controlar a ordem. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('withUserLock', () => {
  it('devolve o valor da função', async () => {
    expect(await withUserLock(1, async () => 42)).toBe(42);
  });

  it('serializa as seções do MESMO usuário: a segunda só começa depois da primeira', async () => {
    const order: string[] = [];
    const gate = deferred();

    const first = withUserLock(2, async () => {
      order.push('a:start');
      await gate.promise;
      order.push('a:end');
    });
    const second = withUserLock(2, async () => {
      order.push('b:start');
    });

    // Deixa a fila andar: se não houvesse lock, `b:start` já teria entrado.
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual(['a:start']);

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('usuários diferentes não esperam um pelo outro', async () => {
    const gate = deferred();
    const blocked = withUserLock(3, () => gate.promise);

    expect(await withUserLock(4, async () => 'livre')).toBe('livre');

    gate.resolve();
    await blocked;
  });

  it('erro de uma seção chega a quem chamou e NÃO trava a fila do usuário', async () => {
    // Função comum que rejeita (não um jest.fn com mockRejectedValue) — ver a
    // armadilha documentada no CLAUDE.md da raiz.
    const failing = async (): Promise<never> => {
      throw new Error('boom');
    };

    await expect(withUserLock(5, failing)).rejects.toThrow('boom');
    expect(await withUserLock(5, async () => 'segue')).toBe('segue');
  });
});
