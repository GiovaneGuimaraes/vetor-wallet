import { describe, it, expect } from 'vitest';
import { parseMoneyInput, diffEditableFields, hasEdits } from './inlineEdit';

describe('parseMoneyInput', () => {
  it('parses a plain decimal', () => {
    expect(parseMoneyInput('1234.56')).toBe(1234.56);
  });

  it('accepts comma as decimal separator (pt-BR)', () => {
    expect(parseMoneyInput('1234,56')).toBe(1234.56);
  });

  it('trims surrounding whitespace', () => {
    expect(parseMoneyInput('  10  ')).toBe(10);
  });

  it('rejects an empty or blank string', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('   ')).toBeNull();
  });

  it('rejects non-numeric text', () => {
    expect(parseMoneyInput('abc')).toBeNull();
  });

  it('rejects zero and negatives', () => {
    expect(parseMoneyInput('0')).toBeNull();
    expect(parseMoneyInput('-5')).toBeNull();
  });

  it('rejects Infinity (the server rejects non-finite amounts with 400)', () => {
    expect(parseMoneyInput('Infinity')).toBeNull();
    expect(parseMoneyInput('1e999')).toBeNull();
  });
});

describe('diffEditableFields', () => {
  it('returns only the changed fields', () => {
    const diff = diffEditableFields(
      { name: 'Salário', type: 'SALARIO', amount: '5000' },
      { name: 'Salário CLT', type: 'SALARIO', amount: '5000' }
    );
    expect(diff).toEqual({ name: 'Salário CLT' });
  });

  it('returns an empty object when nothing changed', () => {
    const diff = diffEditableFields(
      { name: 'Aluguel', category: 'moradia', amount: '1500' },
      { name: 'Aluguel', category: 'moradia', amount: '1500' }
    );
    expect(diff).toEqual({});
    expect(hasEdits(diff)).toBe(false);
  });

  it('reports every changed field at once', () => {
    const diff = diffEditableFields(
      { description: 'Mercado', category: 'casa', amount: '50', date: '2026-07-01' },
      { description: 'Feira', category: 'alimentação', amount: '75', date: '2026-07-02' }
    );
    expect(diff).toEqual({
      description: 'Feira',
      category: 'alimentação',
      amount: '75',
      date: '2026-07-02',
    });
    expect(hasEdits(diff)).toBe(true);
  });

  it('treats clearing a text field as a change (empty string, not omission)', () => {
    const diff = diffEditableFields(
      { name: 'Plano', category: 'saúde' },
      { name: 'Plano', category: '' }
    );
    expect(diff).toEqual({ category: '' });
  });

  it('detects a value↔empty change in both directions', () => {
    expect(diffEditableFields({ note: '3' }, { note: '' })).toEqual({ note: '' });
    expect(diffEditableFields({ note: '' }, { note: '3' })).toEqual({ note: '3' });
    expect(diffEditableFields({ note: '3' }, { note: '3' })).toEqual({});
  });

  it('compares strictly — "10" and 10 are different representations', () => {
    expect(diffEditableFields({ amount: '10' as string | number }, { amount: 10 })).toEqual({
      amount: 10,
    });
  });
});
