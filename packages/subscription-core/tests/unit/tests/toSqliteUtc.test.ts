import { toSqliteUtc } from 'src/toSqliteUtc';

describe('toSqliteUtc', () => {
  test('formata em UTC no formato do SQLite (sem T e sem ms)', () => {
    expect(toSqliteUtc(new Date('2026-08-01T05:06:07.890Z'))).toBe('2026-08-01 05:06:07');
  });

  test('preenche mês/dia/hora com zero à esquerda', () => {
    expect(toSqliteUtc(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('2026-01-02 03:04:05');
  });

  test('não desloca para o fuso local — usa sempre os getters UTC', () => {
    // Instante escolhido para cair em outro DIA se lido em horário local
    // negativo (ex.: America/Sao_Paulo), que é o bug que este formato evita.
    expect(toSqliteUtc(new Date('2026-08-01T02:00:00.000Z'))).toBe('2026-08-01 02:00:00');
  });

  test('o formato ordena lexicograficamente igual à ordem cronológica', () => {
    const antes = toSqliteUtc(new Date('2026-08-01T23:59:59.000Z'));
    const depois = toSqliteUtc(new Date('2026-08-02T00:00:00.000Z'));
    // É disso que dependem as comparações `expires_at > ?` no SQL.
    expect(antes < depois).toBe(true);
  });
});
