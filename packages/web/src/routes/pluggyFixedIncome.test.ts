import { describe, expect, it } from 'vitest';
import type { PluggyFixedIncomePosition, PluggyFixedIncomeResponse } from '@vetor-wallet/shared';
import {
  pluggyCentsForTotal,
  pluggyFailureNote,
  pluggyFixedIncomeView,
  pluggyPositionTitle,
  pluggyRateText,
  pluggyTotalCents,
  sortPluggyByMaturity,
} from './pluggyFixedIncome';

/** Valores inventados: fixture nunca carrega dado real (convenção da raiz). */
function makePosition(
  overrides: Partial<PluggyFixedIncomePosition> = {}
): PluggyFixedIncomePosition {
  return {
    name: 'CDB Exemplo',
    subtype: 'CDB',
    institution: 'Banco Exemplo',
    investedAmount: 1000,
    currentValue: 1100,
    currentValueDate: '2026-10-01',
    maturityDate: '2028-01-31',
    rateType: 'CDI',
    rate: 100,
    ...overrides,
  };
}

function makeResponse(
  overrides: Partial<PluggyFixedIncomeResponse> = {}
): PluggyFixedIncomeResponse {
  return {
    enabled: true,
    connections: 1,
    failedConnections: 0,
    positions: [makePosition()],
    otherInvestments: 0,
    ...overrides,
  };
}

describe('pluggyFixedIncomeView', () => {
  it('falha da chamada → error (a RF manual segue por conta própria)', () => {
    expect(pluggyFixedIncomeView(null, true)).toEqual({ kind: 'error' });
  });

  it('carregando → hidden', () => {
    expect(pluggyFixedIncomeView(null, false)).toEqual({ kind: 'hidden' });
  });

  it('integração desligada → hidden (tela igual a antes)', () => {
    expect(pluggyFixedIncomeView(makeResponse({ enabled: false }), false)).toEqual({
      kind: 'hidden',
    });
  });

  it('sem conexão → hidden, mesmo com a integração ligada', () => {
    expect(pluggyFixedIncomeView(makeResponse({ connections: 0, positions: [] }), false)).toEqual({
      kind: 'hidden',
    });
  });

  it('com conexão: ready com total, posições sem saldo e falhas', () => {
    const view = pluggyFixedIncomeView(
      makeResponse({
        connections: 2,
        failedConnections: 1,
        positions: [makePosition({ currentValue: 200.1 }), makePosition({ currentValue: null })],
      }),
      false
    );
    expect(view).toMatchObject({
      kind: 'ready',
      totalCents: 20010,
      withoutValue: 1,
      failedConnections: 1,
    });
  });

  it('com conexão e sem nenhuma posição de RF: ready vazio (a seção diz que não há)', () => {
    expect(pluggyFixedIncomeView(makeResponse({ positions: [] }), false)).toMatchObject({
      kind: 'ready',
      positions: [],
      totalCents: 0,
    });
  });
});

describe('pluggyTotalCents', () => {
  it('soma em centavos inteiros, sem erro de ponto flutuante', () => {
    expect(
      pluggyTotalCents([makePosition({ currentValue: 0.1 }), makePosition({ currentValue: 0.2 })])
    ).toBe(30);
  });

  it('pula posição sem saldo — nunca a trata como 0 nem como valor aplicado', () => {
    expect(
      pluggyTotalCents([
        makePosition({ currentValue: null, investedAmount: 999 }),
        makePosition({ currentValue: 10 }),
      ])
    ).toBe(1000);
  });
});

describe('pluggyCentsForTotal', () => {
  it('só soma no estado ready', () => {
    expect(pluggyCentsForTotal({ kind: 'error' })).toBe(0);
    expect(pluggyCentsForTotal({ kind: 'hidden' })).toBe(0);
    expect(
      pluggyCentsForTotal({
        kind: 'ready',
        positions: [],
        totalCents: 123,
        withoutValue: 0,
        failedConnections: 0,
      })
    ).toBe(123);
  });
});

describe('sortPluggyByMaturity', () => {
  it('vencimento mais próximo primeiro, sem vencimento no fim, estável no empate', () => {
    const a = makePosition({ name: 'A', maturityDate: null });
    const b = makePosition({ name: 'B', maturityDate: '2030-01-01' });
    const c = makePosition({ name: 'C', maturityDate: '2027-01-01' });
    const d = makePosition({ name: 'D', maturityDate: '2030-01-01' });
    const e = makePosition({ name: 'E', maturityDate: null });
    expect(sortPluggyByMaturity([a, b, c, d, e]).map((p) => p.name)).toEqual([
      'C',
      'B',
      'D',
      'A',
      'E',
    ]);
  });
});

describe('pluggyPositionTitle', () => {
  it('nome · instituição', () => {
    expect(pluggyPositionTitle(makePosition())).toBe('CDB Exemplo · Banco Exemplo');
  });

  it('sem nome, usa o subtipo; sem os dois, rótulo neutro; sem instituição, sem separador', () => {
    expect(pluggyPositionTitle(makePosition({ name: null, institution: null }))).toBe('CDB');
    expect(
      pluggyPositionTitle(makePosition({ name: null, subtype: null, institution: null }))
    ).toBe('Investimento de renda fixa');
  });
});

describe('pluggyRateText', () => {
  it('mostra a taxa crua, sem interpretar o indexador', () => {
    expect(pluggyRateText(makePosition({ rate: 110.5, rateType: 'CDI' }))).toBe('Taxa 110,5 (CDI)');
    expect(pluggyRateText(makePosition({ rate: 12, rateType: null }))).toBe('Taxa 12');
  });

  it('sem taxa → null', () => {
    expect(pluggyRateText(makePosition({ rate: null }))).toBeNull();
  });
});

describe('pluggyFailureNote', () => {
  it('null sem falha; singular e plural', () => {
    expect(pluggyFailureNote(0)).toBeNull();
    expect(pluggyFailureNote(1)).toMatch(/^1 conexão bancária não respondeu/);
    expect(pluggyFailureNote(3)).toMatch(/^3 conexões bancárias não responderam/);
  });
});
