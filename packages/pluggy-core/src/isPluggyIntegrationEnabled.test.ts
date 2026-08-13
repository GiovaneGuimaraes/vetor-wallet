import { describe, it, expect, afterEach } from 'vitest';
import { isPluggyIntegrationEnabled } from './isPluggyIntegrationEnabled';

afterEach(() => {
  delete process.env.ENVIRONMENT;
});

describe('isPluggyIntegrationEnabled (T-089b)', () => {
  it('`Staging` libera', () => {
    process.env.ENVIRONMENT = 'Staging';
    expect(isPluggyIntegrationEnabled()).toBe(true);
  });

  it('caixa e espaço não importam — a intenção é inequívoca', () => {
    for (const value of ['staging', 'STAGING', '  Staging  ']) {
      process.env.ENVIRONMENT = value;
      expect(isPluggyIntegrationEnabled(), value).toBe(true);
    }
  });

  it('`Production` bloqueia', () => {
    process.env.ENVIRONMENT = 'Production';
    expect(isPluggyIntegrationEnabled()).toBe(false);
  });

  it('FAIL CLOSED: ausente, vazia ou desconhecida bloqueiam', () => {
    // O desfecho de um typo não pode ser violar os termos da Pluggy.
    delete process.env.ENVIRONMENT;
    expect(isPluggyIntegrationEnabled()).toBe(false);

    for (const value of ['', '   ', 'Staginng', 'stg', 'dev', 'true', '1']) {
      process.env.ENVIRONMENT = value;
      expect(isPluggyIntegrationEnabled(), value).toBe(false);
    }
  });
});
