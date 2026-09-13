import { describe, it, expect } from 'vitest';
import { forgotDisabledReason, resetDisabledReason } from './authForgotPassword';

const SENHA_OK = 'Senha123!';

describe('forgotDisabledReason (T-108b)', () => {
  it('libera com um e-mail digitado', () => {
    expect(forgotDisabledReason({ email: 'alice@example.com', loading: false })).toBeNull();
  });

  it('trava com e-mail vazio, dizendo o motivo', () => {
    expect(forgotDisabledReason({ email: '', loading: false })).toBe('Digite seu e-mail');
  });

  it('trava com e-mail só de espaços', () => {
    expect(forgotDisabledReason({ email: '   ', loading: false })).toBe('Digite seu e-mail');
  });

  it('trava enquanto carrega, mesmo com e-mail preenchido', () => {
    expect(forgotDisabledReason({ email: 'alice@example.com', loading: true })).toBe('Enviando...');
  });
});

describe('resetDisabledReason (T-108b)', () => {
  it('libera com código completo e senha nova dentro da política', () => {
    expect(
      resetDisabledReason({ code: '123456', newPassword: SENHA_OK, loading: false })
    ).toBeNull();
  });

  it('trava com código incompleto, dizendo o motivo', () => {
    expect(resetDisabledReason({ code: '123', newPassword: SENHA_OK, loading: false })).toBe(
      'Digite os 6 dígitos do código'
    );
  });

  it('trava com código completo mas senha nova fora da política', () => {
    expect(resetDisabledReason({ code: '123456', newPassword: 'fraca', loading: false })).toBe(
      'A senha nova não atende aos requisitos listados abaixo do campo'
    );
  });

  it('trava enquanto carrega, mesmo com tudo preenchido corretamente', () => {
    expect(resetDisabledReason({ code: '123456', newPassword: SENHA_OK, loading: true })).toBe(
      'Confirmando...'
    );
  });
});
