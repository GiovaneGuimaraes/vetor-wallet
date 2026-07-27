import { describe, it, expect } from 'vitest';
import { formatCategoryLabel, normalizeCategory } from './categories';

describe('normalizeCategory', () => {
  it('remove espaços das pontas', () => {
    expect(normalizeCategory('  mercado  ')).toBe('mercado');
  });

  it('dobra a caixa (case-insensitive)', () => {
    expect(normalizeCategory('Mercado')).toBe('mercado');
    expect(normalizeCategory('MERCADO')).toBe('mercado');
    expect(normalizeCategory('mErCaDo')).toBe('mercado');
  });

  it('colapsa espaços internos', () => {
    expect(normalizeCategory('compras   do    mês')).toBe('compras do mês');
  });

  it('dobra a caixa de letras acentuadas (não só ASCII)', () => {
    expect(normalizeCategory('SAÚDE')).toBe('saúde');
    expect(normalizeCategory('Alimentação')).toBe('alimentação');
  });

  it('normaliza unicode para NFC — acento combinante e precomposto viram a mesma chave', () => {
    const precomposto = 'saúde';
    const combinante = precomposto.normalize('NFD'); // u + acento combinante
    expect(precomposto).not.toBe(combinante);
    expect(normalizeCategory(combinante)).toBe(normalizeCategory(precomposto));
  });

  it('categoria vazia ou só espaços vira string vazia', () => {
    expect(normalizeCategory('')).toBe('');
    expect(normalizeCategory('   ')).toBe('');
  });

  it('é idempotente', () => {
    const once = normalizeCategory(' MERCADO  Mensal ');
    expect(normalizeCategory(once)).toBe(once);
  });
});

describe('formatCategoryLabel', () => {
  it('capitaliza só a primeira letra', () => {
    expect(formatCategoryLabel('mercado')).toBe('Mercado');
    expect(formatCategoryLabel('compras do mês')).toBe('Compras do mês');
  });

  it('normaliza antes de formatar', () => {
    expect(formatCategoryLabel('  MERCADO ')).toBe('Mercado');
  });

  it('capitaliza acentuada corretamente', () => {
    expect(formatCategoryLabel('água')).toBe('Água');
  });

  it('devolve string vazia para categoria vazia', () => {
    expect(formatCategoryLabel('')).toBe('');
    expect(formatCategoryLabel('   ')).toBe('');
  });
});
