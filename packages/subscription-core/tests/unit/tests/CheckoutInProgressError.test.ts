import { CheckoutInProgressError } from 'src/CheckoutInProgressError';

describe('CheckoutInProgressError', () => {
  test('é Error, com nome próprio (é por ele que a rota traduz em 409)', () => {
    const err = new CheckoutInProgressError();

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CheckoutInProgressError);
    expect(err.name).toBe('CheckoutInProgressError');
    expect(err.message).toBe('Já existe um checkout de assinatura em criação');
  });

  test('aceita mensagem própria', () => {
    expect(new CheckoutInProgressError('outra').message).toBe('outra');
  });
});
