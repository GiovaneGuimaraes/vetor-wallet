import { describe, it, expect } from 'vitest';
import { PASSWORD_SPECIAL_CHARS, passwordPolicyMet, passwordRules } from './passwordPolicy';

const failing = (password: string) =>
  passwordRules(password)
    .filter((rule) => !rule.ok)
    .map((rule) => rule.key);

describe('passwordRules (T-106b)', () => {
  it('senha que atende ao Cognito defaults passa em tudo', () => {
    expect(failing('Senha123!')).toEqual([]);
    expect(passwordPolicyMet('Senha123!')).toBe(true);
  });

  it('senha vazia quebra tudo menos a regra das pontas', () => {
    expect(failing('')).toEqual(['length', 'lowercase', 'uppercase', 'number', 'special']);
  });

  it('aponta exatamente a regra que falta, uma a uma', () => {
    expect(failing('senha123!')).toEqual(['uppercase']);
    expect(failing('SENHA123!')).toEqual(['lowercase']);
    expect(failing('SenhaBoa!')).toEqual(['number']);
    expect(failing('Senha1234')).toEqual(['special']);
    expect(failing('Se1!')).toEqual(['length']);
  });

  it('espaço nas pontas reprova: o Cognito recusa por FORMATO, antes da política', () => {
    // Comportamento observado contra o pool real: regex ^[\S]+.*[\S]+$, que a
    // rota traduziria como 502 — erro que não diz nada sobre a senha.
    expect(failing(' Senha123!')).toEqual(['edges']);
    expect(failing('Senha123! ')).toEqual(['edges']);
    expect(passwordPolicyMet(' Senha123! ')).toBe(false);
  });

  it('espaço NO MEIO é válido e conta como caractere especial', () => {
    expect(failing('Senha 123')).toEqual([]);
  });

  it('hífen não conta como especial: não está na lista do pool', () => {
    // Se contasse, o front aprovaria uma senha que o Cognito recusa com
    // InvalidPasswordException — o round-trip cego que este módulo evita.
    expect(PASSWORD_SPECIAL_CHARS).not.toContain('-');
    expect(failing('Senha-123')).toEqual(['special']);
  });

  it('as regras vêm sempre na mesma ordem, para a lista não pular na tela', () => {
    expect(passwordRules('x').map((r) => r.key)).toEqual([
      'length',
      'lowercase',
      'uppercase',
      'number',
      'special',
      'edges',
    ]);
  });
});
