import { renewalBase } from 'src/renewalBase';

describe('renewalBase', () => {
  const now = '2026-08-01 00:00:00';

  test('usa o fim do período vigente quando ele está no futuro (não perde dias)', () => {
    expect(renewalBase(now, '2026-09-10 00:00:00')).toBe('2026-09-10 00:00:00');
  });

  test('usa agora quando o período já venceu (não presenteia o tempo sem pagar)', () => {
    expect(renewalBase(now, '2026-07-01 00:00:00')).toBe(now);
  });

  test('usa agora quando o período termina exatamente agora', () => {
    expect(renewalBase(now, now)).toBe(now);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['string vazia', ''],
  ])('usa agora quando não há período vigente (%s)', (_label, value) => {
    expect(renewalBase(now, value)).toBe(now);
  });
});
