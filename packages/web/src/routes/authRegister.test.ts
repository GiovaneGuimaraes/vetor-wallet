import { describe, it, expect } from 'vitest';
import { interpretRegisterResult } from './authRegister';

describe('interpretRegisterResult (T-106)', () => {
  it('cadastro já confirmado devolve o usuário, sem o campo de controle', () => {
    const outcome = interpretRegisterResult({
      pendingConfirmation: false,
      id: 7,
      email: 'alice@example.com',
      name: null,
      phone: null,
      created_at: '2026-08-18 12:00:00',
      roles: [],
    });

    expect(outcome).toEqual({
      kind: 'authenticated',
      user: {
        id: 7,
        email: 'alice@example.com',
        name: null,
        phone: null,
        created_at: '2026-08-18 12:00:00',
        roles: [],
      },
    });
    expect('pendingConfirmation' in (outcome as { user: object }).user).toBe(false);
  });

  it('cadastro pendente devolve aviso com o e-mail e NÃO autentica', () => {
    const outcome = interpretRegisterResult({
      pendingConfirmation: true,
      email: 'alice@example.com',
    });

    expect(outcome.kind).toBe('pendingConfirmation');
    expect(outcome.kind === 'pendingConfirmation' && outcome.message).toContain(
      'alice@example.com'
    );
  });
});
