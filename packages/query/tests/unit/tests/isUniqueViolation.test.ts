import { isUniqueViolation } from 'src/isUniqueViolation';

describe('isUniqueViolation (Postgres)', () => {
  it('reconhece o SQLSTATE 23505 pelo código', () => {
    expect(isUniqueViolation(Object.assign(new Error('boom'), { code: '23505' }))).toBe(true);
  });

  it('reconhece pela mensagem quando o código se perde na serialização', () => {
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint'))).toBe(
      true
    );
  });

  it('NÃO trata violação de chave estrangeira como unicidade', () => {
    expect(isUniqueViolation(Object.assign(new Error('fk'), { code: '23503' }))).toBe(false);
  });

  it('NÃO trata NOT NULL como unicidade', () => {
    expect(isUniqueViolation(Object.assign(new Error('null'), { code: '23502' }))).toBe(false);
  });

  it('recusa erro qualquer, null, undefined e não-objeto', () => {
    expect(isUniqueViolation(new Error('disco cheio'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
