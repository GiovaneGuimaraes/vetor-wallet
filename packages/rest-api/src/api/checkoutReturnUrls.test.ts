import { describe, it, expect } from 'vitest';
import { appOrigin, checkoutReturnUrls, DEFAULT_APP_ORIGIN } from './checkoutReturnUrls';

describe('appOrigin', () => {
  it.each([
    ['ausente', undefined, DEFAULT_APP_ORIGIN],
    ['vazia', '', DEFAULT_APP_ORIGIN],
    ['uma origem', 'https://app.example.com', 'https://app.example.com'],
    ['com barra final', 'https://app.example.com/', 'https://app.example.com'],
    [
      'com caminho e query (reduz à origem)',
      'https://app.example.com/x?y=1#z',
      'https://app.example.com',
    ],
    [
      'lista: usa a primeira',
      'https://a.example.com, https://b.example.com',
      'https://a.example.com',
    ],
    ['lista com lixo antes', 'nao-e-url, ,http://localhost:5174', 'http://localhost:5174'],
    ['protocolo não http(s)', 'javascript:alert(1)', DEFAULT_APP_ORIGIN],
    ['só lixo', 'nada,aqui', DEFAULT_APP_ORIGIN],
  ])('%s', (_l, raw, expected) => {
    expect(appOrigin(raw)).toBe(expected);
  });
});

describe('checkoutReturnUrls', () => {
  it('monta as duas URLs de volta em /planos', () => {
    expect(checkoutReturnUrls('https://app.example.com')).toEqual({
      completionUrl: 'https://app.example.com/planos?checkout=completed',
      returnUrl: 'https://app.example.com/planos?checkout=returned',
    });
  });
});
