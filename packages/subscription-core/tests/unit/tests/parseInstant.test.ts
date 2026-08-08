import { parseInstant } from 'src/parseInstant';

describe('parseInstant', () => {
  test('trata instante do SQLite (sem timezone) como UTC', () => {
    expect(parseInstant('2026-08-01 12:00:00').toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  test('aceita ISO 8601 com Z', () => {
    expect(parseInstant('2026-08-01T12:00:00.000Z').toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  test('respeita offset explícito em vez de forçar UTC', () => {
    expect(parseInstant('2026-08-01T12:00:00-03:00').toISOString()).toBe(
      '2026-08-01T15:00:00.000Z'
    );
    expect(parseInstant('2026-08-01T12:00:00-0300').toISOString()).toBe('2026-08-01T15:00:00.000Z');
  });

  test('ignora espaço em volta', () => {
    expect(parseInstant('  2026-08-01 12:00:00  ').toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  test('entrada inválida vira Invalid Date (quem chama decide o fallback)', () => {
    expect(Number.isNaN(parseInstant('nao-e-data').getTime())).toBe(true);
  });
});
