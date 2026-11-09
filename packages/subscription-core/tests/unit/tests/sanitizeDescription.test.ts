import {
  FALLBACK_DESCRIPTION,
  sanitizeDescription,
} from 'src/providers/abacatepay/sanitizeDescription';

describe('sanitizeDescription', () => {
  test('troca o travessão do texto que o app monta por hífen (a causa do 502)', () => {
    expect(sanitizeDescription('Vetor Wallet — Pro Mensal')).toBe('Vetor Wallet - Pro Mensal');
  });

  test('en dash e demais travessões também viram hífen', () => {
    expect(sanitizeDescription('a – b')).toBe('a - b');
    expect(sanitizeDescription('a ― b')).toBe('a - b');
  });

  test('mantém acentos, dígitos e a pontuação que a API aceita', () => {
    const ok = 'Assinatura ação É (mensal) #1 & co. a:b;c/d_e,f @ 10% +1=2 x-y';
    expect(sanitizeDescription(ok)).toBe(ok);
  });

  test.each([
    ['aspas tipográficas', 'Plano “Pro”', 'Plano Pro'],
    ['euro', 'Plano 5€', 'Plano 5'],
    ['cifrão', 'R$ 9,90', 'R 9,90'],
    ['espaço não separável', 'a b', 'a b'],
    ['multiplicação e divisão (fora do conjunto medido)', 'a×b÷c', 'a b c'],
  ])('troca %s por espaço', (_nome, entrada, esperado) => {
    expect(sanitizeDescription(entrada)).toBe(esperado);
  });

  test('colapsa espaços repetidos e apara as pontas', () => {
    expect(sanitizeDescription('  a   $$   b  ')).toBe('a b');
  });

  test('cai no fallback quando nada sobra', () => {
    expect(sanitizeDescription('')).toBe(FALLBACK_DESCRIPTION);
    expect(sanitizeDescription('€ $ “”')).toBe(FALLBACK_DESCRIPTION);
  });
});
