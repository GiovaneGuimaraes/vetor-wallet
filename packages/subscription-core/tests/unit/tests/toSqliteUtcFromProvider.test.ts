import { toSqliteUtcFromProvider } from 'src/toSqliteUtcFromProvider';

describe('toSqliteUtcFromProvider', () => {
  test('converte o ISO do provedor para o formato do banco', () => {
    expect(toSqliteUtcFromProvider('2026-08-01T12:00:00.000Z')).toBe('2026-08-01 12:00:00');
  });

  test('converte respeitando o offset informado', () => {
    expect(toSqliteUtcFromProvider('2026-08-01T12:00:00-03:00')).toBe('2026-08-01 15:00:00');
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['string vazia', ''],
  ])('%s vira null ("sem expiração conhecida")', (_label, value) => {
    expect(toSqliteUtcFromProvider(value)).toBeNull();
  });

  test('data impossível vira null, nunca a string "Invalid Date"', () => {
    expect(toSqliteUtcFromProvider('nao-e-data')).toBeNull();
  });
});
