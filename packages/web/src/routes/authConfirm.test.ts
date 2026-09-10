import { describe, it, expect } from 'vitest';
import { AuthApiError } from '../api';
import {
  CONFIRMATION_CODE_LENGTH,
  confirmDisabledReason,
  interpretAuthError,
  normalizeConfirmationCode,
} from './authConfirm';

describe('normalizeConfirmationCode (T-106)', () => {
  it('mantém só dígitos: código colado do e-mail vem com espaço e quebra de linha', () => {
    expect(normalizeConfirmationCode(' 123 456 \n')).toBe('123456');
  });

  it('descarta letras em vez de deixar o Cognito recusar por formato', () => {
    expect(normalizeConfirmationCode('12a3b4')).toBe('1234');
  });

  it('trunca no tamanho do código do Cognito', () => {
    expect(normalizeConfirmationCode('1234567890')).toBe('123456');
    expect(CONFIRMATION_CODE_LENGTH).toBe(6);
  });

  it('string sem dígito nenhum vira vazio', () => {
    expect(normalizeConfirmationCode('abc')).toBe('');
  });
});

describe('confirmDisabledReason (T-106)', () => {
  it('libera com o código completo', () => {
    expect(confirmDisabledReason({ code: '123456', loading: false })).toBeNull();
  });

  it('trava com código incompleto, dizendo o motivo', () => {
    expect(confirmDisabledReason({ code: '123', loading: false })).toBe(
      'Digite os 6 dígitos do código'
    );
  });

  it('trava enquanto carrega, mesmo com o código completo', () => {
    expect(confirmDisabledReason({ code: '123456', loading: true })).toBe('Confirmando...');
  });
});

describe('interpretAuthError (T-106)', () => {
  it('USER_NOT_CONFIRMED manda para a etapa de código, não para o erro', () => {
    const outcome = interpretAuthError(
      new AuthApiError('Cadastro ainda nao confirmado', 'USER_NOT_CONFIRMED')
    );
    expect(outcome.needsConfirmation).toBe(true);
    expect(outcome.message).toContain('código');
  });

  it('erro de credencial continua sendo mensagem de erro', () => {
    const outcome = interpretAuthError(new AuthApiError('E-mail ou senha invalidos', null));
    expect(outcome).toEqual({ needsConfirmation: false, message: 'E-mail ou senha invalidos' });
  });

  it('outro código do backend não desvia o fluxo', () => {
    const outcome = interpretAuthError(
      new AuthApiError('Autenticacao indisponivel', 'AUTH_UNAVAILABLE')
    );
    expect(outcome.needsConfirmation).toBe(false);
  });

  it('erro que não é da API vira mensagem genérica sem quebrar a tela', () => {
    expect(interpretAuthError('boom')).toEqual({
      needsConfirmation: false,
      message: 'Erro desconhecido',
    });
  });
});
