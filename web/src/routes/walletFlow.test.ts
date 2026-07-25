import { describe, it, expect } from 'vitest';
import { decideWalletFlow } from './walletFlow';

describe('decideWalletFlow', () => {
  it('decide criar a carteira automaticamente quando o usuário não tem nenhuma', () => {
    expect(decideWalletFlow([], false)).toEqual({ action: 'create' });
  });

  it('decide criar mesmo com forceList quando não há nenhuma carteira (nada para listar)', () => {
    expect(decideWalletFlow([], true)).toEqual({ action: 'create' });
  });

  it('decide redirecionar direto para o dashboard quando há exatamente 1 carteira', () => {
    expect(decideWalletFlow([{ id: 42 }], false)).toEqual({ action: 'redirect', walletId: 42 });
  });

  it('decide listar quando há exatamente 1 carteira mas o usuário pediu a lista (?manage=1)', () => {
    expect(decideWalletFlow([{ id: 42 }], true)).toEqual({ action: 'list' });
  });

  it('decide listar quando há 2+ carteiras (dados legados), independente de forceList', () => {
    expect(decideWalletFlow([{ id: 1 }, { id: 2 }], false)).toEqual({ action: 'list' });
    expect(decideWalletFlow([{ id: 1 }, { id: 2 }], true)).toEqual({ action: 'list' });
  });

  it('decide listar quando há 3 carteiras', () => {
    expect(decideWalletFlow([{ id: 1 }, { id: 2 }, { id: 3 }], false)).toEqual({ action: 'list' });
  });
});
