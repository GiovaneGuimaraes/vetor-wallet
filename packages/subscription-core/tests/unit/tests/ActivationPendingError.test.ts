import { ActivationPendingError } from 'src/ActivationPendingError';
import { AlreadySubscribedError } from 'src/AlreadySubscribedError';

describe('ActivationPendingError', () => {
  test('é AlreadySubscribedError (rota que só conhece o pai responde 409, que é seguro)', () => {
    const err = new ActivationPendingError();

    expect(err).toBeInstanceOf(AlreadySubscribedError);
    expect(err).toBeInstanceOf(ActivationPendingError);
    expect(err.name).toBe('ActivationPendingError');
    expect(err.message).toBe('Pagamento confirmado aguardando ativação');
  });

  test('aceita mensagem própria', () => {
    expect(new ActivationPendingError('outra').message).toBe('outra');
  });
});
