import { AlreadySubscribedError } from 'src/AlreadySubscribedError';

describe('AlreadySubscribedError', () => {
  test('é Error, com nome próprio (é por ele que a rota traduz em 409)', () => {
    const err = new AlreadySubscribedError();

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AlreadySubscribedError);
    expect(err.name).toBe('AlreadySubscribedError');
    expect(err.message).toBe('Já existe uma assinatura ativa');
  });

  test('aceita mensagem própria', () => {
    expect(new AlreadySubscribedError('outra').message).toBe('outra');
  });
});
