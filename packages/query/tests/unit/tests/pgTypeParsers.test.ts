import { types } from 'pg';
import { pinPgTypeParsers } from 'src/pgTypeParsers';

describe('pinPgTypeParsers', () => {
  it('faz DATE, TIMESTAMP e TIMESTAMPTZ voltarem como texto', () => {
    pinPgTypeParsers();

    const date = types.getTypeParser(1082) as (v: string) => unknown;
    const timestamp = types.getTypeParser(1114) as (v: string) => unknown;
    const timestamptz = types.getTypeParser(1184) as (v: string) => unknown;

    expect(date('2026-09-20')).toBe('2026-09-20');
    expect(timestamp('2026-09-20 12:00:00')).toBe('2026-09-20 12:00:00');
    expect(timestamptz('2026-09-20 12:00:00+00')).toBe('2026-09-20 12:00:00+00');
  });

  it('é idempotente — chamar duas vezes não muda nada', () => {
    pinPgTypeParsers();
    pinPgTypeParsers();
    const date = types.getTypeParser(1082) as (v: string) => unknown;
    expect(date('2026-01-01')).toBe('2026-01-01');
  });
});
