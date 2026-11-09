import {
  billingCustomerName,
  FALLBACK_CUSTOMER_NAME,
  MAX_CUSTOMER_NAME_LENGTH,
} from 'src/billingCustomerName';

describe('billingCustomerName', () => {
  test('usa o nome do perfil, com espaços normalizados', () => {
    expect(billingCustomerName({ name: '  Ana   Souza ', email: 'x@example.com' })).toBe(
      'Ana Souza'
    );
  });

  test.each([
    ['null', null],
    ['vazio', ''],
    ['só espaços', '   '],
  ])('nome %s → parte do e-mail antes do @, sanitizada', (_l, name) => {
    expect(billingCustomerName({ name, email: 'joao.silva+teste_1@example.com' })).toBe(
      'joao silva teste 1'
    );
  });

  test('acentos do e-mail sobrevivem', () => {
    expect(billingCustomerName({ name: null, email: 'joão-ção@example.com' })).toBe('joão ção');
  });

  test('e-mail sem nada aproveitável → fallback', () => {
    expect(billingCustomerName({ name: null, email: '+._@example.com' })).toBe(
      FALLBACK_CUSTOMER_NAME
    );
    expect(billingCustomerName({ name: null, email: '' })).toBe(FALLBACK_CUSTOMER_NAME);
  });

  test('corta no teto, sem espaço no fim', () => {
    const long = `${'a'.repeat(MAX_CUSTOMER_NAME_LENGTH - 1)} bbbb`;
    const out = billingCustomerName({ name: long, email: 'x@example.com' });
    expect(out).toBe('a'.repeat(MAX_CUSTOMER_NAME_LENGTH - 1));
  });
});
