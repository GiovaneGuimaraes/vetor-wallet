import { describe, expect, it } from 'vitest';
import { INTERNAL_MOVEMENT_CATEGORIES, classifyInternalMovement } from './internalMovement';

describe('classifyInternalMovement', () => {
  it('marca transferência entre contas do próprio titular', () => {
    expect(classifyInternalMovement('Same person transfer')).toMatch(/próprio titular/);
  });

  it('marca pagamento de fatura do cartão', () => {
    expect(classifyInternalMovement('Credit card payment')).toMatch(/fatura/);
  });

  it('marca aplicação/resgate de investimento', () => {
    expect(classifyInternalMovement('Investments')).toMatch(/investimento/);
  });

  it('NÃO marca a guarda-chuva `Transfers` — transferência a terceiros é dinheiro real', () => {
    expect(classifyInternalMovement('Transfers')).toBeNull();
  });

  it('não marca categoria de gasto comum', () => {
    expect(classifyInternalMovement('Supermarket')).toBeNull();
    expect(classifyInternalMovement('Food and drinks')).toBeNull();
  });

  it('é case-insensitive e ignora espaço de sobra', () => {
    expect(classifyInternalMovement('  SAME PERSON TRANSFER  ')).not.toBeNull();
    expect(classifyInternalMovement('same  person   transfer')).not.toBeNull();
    expect(classifyInternalMovement('Credit Card Payment')).not.toBeNull();
  });

  it('categoria ausente ou vazia é lançamento normal (fail open)', () => {
    expect(classifyInternalMovement(null)).toBeNull();
    expect(classifyInternalMovement(undefined)).toBeNull();
    expect(classifyInternalMovement('')).toBeNull();
    expect(classifyInternalMovement('   ')).toBeNull();
  });

  it('não casa por substring — categoria desconhecida que contém uma folha passa', () => {
    // `includes` pegaria estas duas; a comparação é por igualdade normalizada.
    expect(classifyInternalMovement('Investments advisory fee')).toBeNull();
    expect(classifyInternalMovement('Not a same person transfer')).toBeNull();
  });

  it('todo motivo do mapa é uma frase em pt-BR não vazia', () => {
    for (const [key, reason] of Object.entries(INTERNAL_MOVEMENT_CATEGORIES)) {
      expect(key, 'a chave do mapa precisa estar normalizada em minúsculas').toBe(
        key.trim().toLowerCase()
      );
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
