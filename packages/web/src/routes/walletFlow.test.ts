import { describe, it, expect } from 'vitest';
import type { Wallet } from '@vetor-wallet/shared';
import { decideWalletFlow, resolvePrimaryWallet } from './walletFlow';

function wallet(id: number, name = `w${id}`): Wallet {
  return { id, user_id: 1, name, description: '', color: '#e3d5b8', created_at: '2026-01-01' };
}

describe('decideWalletFlow (T-050b — carteira única)', () => {
  it('fica em loading enquanto a primeira busca não terminou, independente do resto', () => {
    expect(decideWalletFlow(null, false, false)).toBe('loading');
    expect(decideWalletFlow(null, false, true)).toBe('loading');
    expect(decideWalletFlow({ id: 1 }, false, false)).toBe('loading');
  });

  it('decide "create" quando carregou sem erro e o usuário não tem carteira', () => {
    expect(decideWalletFlow(null, true, false)).toBe('create');
  });

  it('decide "ready" quando há carteira', () => {
    expect(decideWalletFlow({ id: 42 }, true, false)).toBe('ready');
  });

  // Invariante herdada da T-027 (achado bloqueante do revisor na época): uma
  // falha de rede que deixa `wallet` null não pode virar criação automática.
  describe('ramo de erro de carga (hadLoadError)', () => {
    it('decide "error" — NUNCA "create" — quando não há carteira por falha de carga', () => {
      expect(decideWalletFlow(null, true, true)).toBe('error');
    });

    it('decide "ready" quando já há carteira carregada e uma busca seguinte falha', () => {
      expect(decideWalletFlow({ id: 7 }, true, true)).toBe('ready');
    });
  });
});

describe('resolvePrimaryWallet', () => {
  it('devolve null para lista vazia', () => {
    expect(resolvePrimaryWallet([])).toBeNull();
  });

  it('devolve a única carteira quando só há uma', () => {
    expect(resolvePrimaryWallet([wallet(9)])?.id).toBe(9);
  });

  it('escolhe a de menor id numa base legada com 2+ carteiras', () => {
    expect(resolvePrimaryWallet([wallet(3), wallet(1), wallet(2)])?.id).toBe(1);
  });

  it('independe da ordem de chegada da lista', () => {
    const ws = [wallet(10, 'a'), wallet(4, 'b'), wallet(7, 'c')];
    expect(resolvePrimaryWallet(ws)?.id).toBe(4);
    expect(resolvePrimaryWallet([...ws].reverse())?.id).toBe(4);
  });

  it('devolve o objeto completo (o rótulo exibido usa nome e cor)', () => {
    const primary = resolvePrimaryWallet([wallet(5, 'Segunda'), wallet(2, 'Principal')]);
    expect(primary).toMatchObject({ id: 2, name: 'Principal', color: '#e3d5b8' });
  });
});
