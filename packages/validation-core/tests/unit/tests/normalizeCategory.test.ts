import { normalizeCategory } from 'src/normalizeCategory';

/**
 * Espelho de `web/src/routes/categories.test.ts` — as duas cópias da
 * normalização devem continuar concordando (ver comentário em
 * normalizeCategory.ts sobre por que a função não vive em `shared/`).
 */
describe('normalizeCategory', () => {
  it('remove espaços das pontas', () => {
    expect(normalizeCategory('  mercado  ')).toBe('mercado');
  });

  it('dobra a caixa (case-insensitive)', () => {
    expect(normalizeCategory('Mercado')).toBe('mercado');
    expect(normalizeCategory('MERCADO')).toBe('mercado');
  });

  it('colapsa espaços internos', () => {
    expect(normalizeCategory('compras   do    mês')).toBe('compras do mês');
  });

  it('dobra a caixa de letras acentuadas (não só ASCII, como o lower() do SQLite)', () => {
    expect(normalizeCategory('SAÚDE')).toBe('saúde');
    expect(normalizeCategory('Alimentação')).toBe('alimentação');
  });

  it('normaliza unicode para NFC', () => {
    const precomposto = 'saúde';
    const combinante = precomposto.normalize('NFD');
    expect(precomposto).not.toBe(combinante);
    expect(normalizeCategory(combinante)).toBe(normalizeCategory(precomposto));
  });

  it('categoria vazia ou só espaços vira string vazia', () => {
    expect(normalizeCategory('')).toBe('');
    expect(normalizeCategory('   ')).toBe('');
  });

  it('é idempotente — rodar de novo sobre o resultado não muda nada', () => {
    const once = normalizeCategory(' MERCADO  Mensal ');
    expect(normalizeCategory(once)).toBe(once);
  });
});
