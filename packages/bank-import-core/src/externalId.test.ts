import { describe, it, expect } from 'vitest';
import { validateExternalId, MAX_EXTERNAL_ID_LENGTH } from './externalId';

describe('validateExternalId (T-084)', () => {
  it('trata undefined e null como ausente (grava NULL)', () => {
    expect(validateExternalId(undefined)).toEqual({ ok: true, value: null });
    expect(validateExternalId(null)).toEqual({ ok: true, value: null });
  });

  it('aceita string e devolve o valor trimado', () => {
    expect(validateExternalId('ofx:FIT-1')).toEqual({ ok: true, value: 'ofx:FIT-1' });
    expect(validateExternalId('  ofx:FIT-1  ')).toEqual({ ok: true, value: 'ofx:FIT-1' });
  });

  it('não normaliza caixa nem restringe charset', () => {
    expect(validateExternalId('OFX:Fit-1')).toEqual({ ok: true, value: 'OFX:Fit-1' });
    expect(validateExternalId('a b/c#1')).toEqual({ ok: true, value: 'a b/c#1' });
  });

  it('recusa não-string', () => {
    for (const raw of [123, true, {}, [], 1.5]) {
      const res = validateExternalId(raw);
      expect(res.ok).toBe(false);
      expect(res).toMatchObject({ error: 'externalId deve ser texto' });
    }
  });

  it('recusa vazio e só-espaços (não trata como ausente)', () => {
    for (const raw of ['', '   ', '\t\n']) {
      expect(validateExternalId(raw)).toEqual({
        ok: false,
        error: 'externalId não pode ser vazio',
      });
    }
  });

  it(`aceita ${MAX_EXTERNAL_ID_LENGTH} chars e recusa acima disso`, () => {
    const max = 'x'.repeat(MAX_EXTERNAL_ID_LENGTH);
    expect(validateExternalId(max)).toEqual({ ok: true, value: max });

    const tooLong = 'x'.repeat(MAX_EXTERNAL_ID_LENGTH + 1);
    const res = validateExternalId(tooLong);
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({
      error: `externalId deve ter no máximo ${MAX_EXTERNAL_ID_LENGTH} caracteres`,
    });
  });

  it('mede o tamanho DEPOIS do trim', () => {
    const padded = `  ${'x'.repeat(MAX_EXTERNAL_ID_LENGTH)}  `;
    expect(validateExternalId(padded)).toEqual({
      ok: true,
      value: 'x'.repeat(MAX_EXTERNAL_ID_LENGTH),
    });
  });
});
