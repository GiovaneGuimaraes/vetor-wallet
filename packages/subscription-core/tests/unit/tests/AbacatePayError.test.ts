import { AbacatePayError } from 'src/providers/abacatepay/AbacatePayError';

describe('AbacatePayError', () => {
  test('é um Error com name próprio (sobrevive a instanceof nas rotas)', () => {
    const err = new AbacatePayError('falhou', 502, { detail: 'x' });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AbacatePayError);
    expect(err.name).toBe('AbacatePayError');
    expect(err.message).toBe('falhou');
  });

  test('carrega o status HTTP e o corpo da resposta', () => {
    const err = new AbacatePayError('falhou', 400, { code: 'INVALID' });

    expect(err.status).toBe(400);
    expect(err.body).toEqual({ code: 'INVALID' });
  });

  test('status 0 significa rede/timeout — nenhuma resposta chegou', () => {
    // A distinção importa para quem decide entre "recusado pelo provedor" e
    // "não sabemos, pode ter passado".
    const err = new AbacatePayError('timeout', 0);

    expect(err.status).toBe(0);
    expect(err.body).toBeUndefined();
  });
});
