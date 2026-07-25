import { describe, it, expect } from 'vitest';
import { decideWalletFlow } from './walletFlow';

describe('decideWalletFlow', () => {
  it('decide criar a carteira automaticamente quando o usuário não tem nenhuma (sem erro de carga)', () => {
    expect(decideWalletFlow([], false, false)).toEqual({ action: 'create' });
  });

  it('decide criar mesmo com forceList quando não há nenhuma carteira (nada para listar)', () => {
    expect(decideWalletFlow([], true, false)).toEqual({ action: 'create' });
  });

  it('decide redirecionar direto para o dashboard quando há exatamente 1 carteira', () => {
    expect(decideWalletFlow([{ id: 42 }], false, false)).toEqual({ action: 'redirect', walletId: 42 });
  });

  it('decide listar quando há exatamente 1 carteira mas o usuário pediu a lista (?manage=1)', () => {
    expect(decideWalletFlow([{ id: 42 }], true, false)).toEqual({ action: 'list' });
  });

  it('decide listar quando há 2+ carteiras (dados legados), independente de forceList', () => {
    expect(decideWalletFlow([{ id: 1 }, { id: 2 }], false, false)).toEqual({ action: 'list' });
    expect(decideWalletFlow([{ id: 1 }, { id: 2 }], true, false)).toEqual({ action: 'list' });
  });

  it('decide listar quando há 3 carteiras', () => {
    expect(decideWalletFlow([{ id: 1 }, { id: 2 }, { id: 3 }], false, false)).toEqual({ action: 'list' });
  });

  // T-027 (achado bloqueante do revisor): 0 carteiras + falha na busca não
  // pode significar "crie a Principal automaticamente" — pode ser um
  // usuário com carteiras reais vítima de uma falha transitória de rede.
  describe('ramo de erro de carga (hadLoadError)', () => {
    it('decide "error" quando a lista está vazia por falha de carga, mesmo sem forceList', () => {
      expect(decideWalletFlow([], false, true)).toEqual({ action: 'error' });
    });

    it('decide "error" quando a lista está vazia por falha de carga, mesmo com forceList', () => {
      expect(decideWalletFlow([], true, true)).toEqual({ action: 'error' });
    });

    it('NÃO decide "error" (nem "create") quando já há 1 carteira carregada e uma busca seguinte falha — usa os dados que já tem', () => {
      expect(decideWalletFlow([{ id: 7 }], false, true)).toEqual({ action: 'redirect', walletId: 7 });
    });

    it('NÃO decide "error" quando já há 2+ carteiras carregadas e uma busca seguinte falha — segue listando', () => {
      expect(decideWalletFlow([{ id: 1 }, { id: 2 }], false, true)).toEqual({ action: 'list' });
    });
  });
});
