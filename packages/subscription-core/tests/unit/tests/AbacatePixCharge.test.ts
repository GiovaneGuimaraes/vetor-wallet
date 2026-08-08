import {
  type RawAbacateCharge,
  toAbacatePixCharge,
} from 'src/providers/abacatepay/AbacatePixCharge';

const raw: RawAbacateCharge = {
  id: 'pix_char_abc',
  amount: 2990,
  status: 'PENDING',
  brCode: '00020126...',
  brCodeBase64: 'data:image/png;base64,AAA',
  expiresAt: '2026-08-01T13:00:00.000Z',
};

describe('toAbacatePixCharge', () => {
  test('normaliza a cobrança do provedor', () => {
    expect(toAbacatePixCharge(raw)).toEqual({
      id: 'pix_char_abc',
      amount: 2990,
      status: 'PENDING',
      brCode: '00020126...',
      brCodeBase64: 'data:image/png;base64,AAA',
      expiresAt: '2026-08-01T13:00:00.000Z',
      devMode: undefined,
    });
  });

  test.each([
    ['ausente', undefined],
    ['null', null],
  ])('expiresAt %s vira null explícito', (_label, expiresAt) => {
    // `undefined` sumiria do JSON; quem grava depende do null para dizer "sem
    // expiração conhecida".
    expect(toAbacatePixCharge({ ...raw, expiresAt }).expiresAt).toBeNull();
  });

  test('preserva devMode quando o provedor informa', () => {
    expect(toAbacatePixCharge({ ...raw, devMode: true }).devMode).toBe(true);
  });

  test('o valor fica em CENTAVOS, como o provedor transaciona', () => {
    expect(toAbacatePixCharge({ ...raw, amount: 100 }).amount).toBe(100);
  });
});
