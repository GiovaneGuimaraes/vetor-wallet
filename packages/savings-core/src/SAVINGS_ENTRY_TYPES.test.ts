import { describe, it, expect } from 'vitest';
import { SAVINGS_ENTRY_TYPES, isSavingsEntryType } from './SAVINGS_ENTRY_TYPES';

describe('SAVINGS_ENTRY_TYPES', () => {
  it('é a lista dos três tipos, em ordem estável (a mensagem de 400 a usa)', () => {
    expect(SAVINGS_ENTRY_TYPES).toEqual(['DEPOSIT', 'WITHDRAW', 'YIELD']);
  });

  it('reconhece os tipos válidos', () => {
    for (const type of SAVINGS_ENTRY_TYPES) expect(isSavingsEntryType(type)).toBe(true);
  });

  it('recusa desconhecido, caixa trocada e não-string', () => {
    for (const raw of ['TRANSFER', 'deposit', '', undefined, null, 1, {}, []]) {
      expect(isSavingsEntryType(raw)).toBe(false);
    }
  });
});
