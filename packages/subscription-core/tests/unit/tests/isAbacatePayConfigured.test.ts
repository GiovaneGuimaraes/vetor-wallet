import { isAbacatePayConfigured } from 'src/providers/abacatepay/isAbacatePayConfigured';

describe('isAbacatePayConfigured', () => {
  test('é true com credencial preenchida', () => {
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    expect(isAbacatePayConfigured()).toBe(true);
  });

  test.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['só espaços', '   '],
  ])('credencial %s deixa o billing indisponível', (_label, value) => {
    if (value === undefined) delete process.env.ABACATEPAY_API_KEY;
    else process.env.ABACATEPAY_API_KEY = value;

    expect(isAbacatePayConfigured()).toBe(false);
  });
});
