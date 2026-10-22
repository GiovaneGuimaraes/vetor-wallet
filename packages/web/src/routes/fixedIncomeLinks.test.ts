import { describe, expect, it } from 'vitest';
import type {
  FixedIncomePosition,
  PluggyFixedIncomePosition,
  PluggyFixedIncomeResponse,
} from '@vetor-wallet/shared';
import {
  consolidateFixedIncome,
  LINK_INACTIVE_REASON_TEXT,
  pluggyLinkedBadge,
  rankLinkCandidates,
  resolveManualLinks,
} from './fixedIncomeLinks';

/** Valores inventados: fixture nunca carrega dado real (convenção da raiz). */
function manual(overrides: Partial<FixedIncomePosition> = {}): FixedIncomePosition {
  return {
    id: 1,
    user_id: 1,
    name: 'CDB Teste',
    kind: 'CDB',
    institution: '',
    invested_amount: 100,
    invested_at: '2026-01-01',
    maturity_date: '2030-01-01',
    rate_type: 'CDI',
    rate: 100,
    current_value: null,
    current_value_date: null,
    superseded_by_pluggy_investment_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function pluggy(overrides: Partial<PluggyFixedIncomePosition> = {}): PluggyFixedIncomePosition {
  return {
    id: 'inv-1',
    name: 'Investimento Teste',
    subtype: 'CDB',
    institution: null,
    investedAmount: 90,
    currentValue: 110,
    currentValueDate: '2026-10-01',
    maturityDate: '2030-01-01',
    rateType: null,
    rate: null,
    ...overrides,
  };
}

function ready(
  positions: PluggyFixedIncomePosition[],
  overrides: Partial<PluggyFixedIncomeResponse> = {}
): PluggyFixedIncomeResponse {
  return {
    enabled: true,
    connections: 1,
    failedConnections: 0,
    positions,
    otherInvestments: 0,
    ...overrides,
  };
}

describe('resolveManualLinks', () => {
  it('posição sem vínculo é unlinked e conta no total', () => {
    const r = resolveManualLinks([manual()], ready([pluggy()]), false);
    expect(r.states.get(1)).toEqual({ kind: 'unlinked' });
    expect(r.manualCentsCounted).toBe(10000);
    expect(r.coveredManualCents).toBe(0);
    expect(r.linkedByPluggyId.size).toBe(0);
  });

  it('vínculo com investimento presente e com saldo: active, sai do total', () => {
    const target = pluggy();
    const r = resolveManualLinks(
      [
        manual({
          superseded_by_pluggy_investment_id: 'inv-1',
          current_value: 120.5,
          current_value_date: '2026-09-01',
        }),
        manual({ id: 2, invested_amount: 50 }),
      ],
      ready([target]),
      false
    );
    expect(r.states.get(1)).toEqual({ kind: 'active', pluggy: target });
    expect(r.coveredManualCents).toBe(12050);
    expect(r.manualCentsCounted).toBe(5000);
  });

  const linked = manual({ superseded_by_pluggy_investment_id: 'inv-1' });

  it.each([
    ['pending', null, false],
    ['connection-failed', null, true],
    ['unavailable', ready([pluggy()], { enabled: false }), false],
    ['unavailable', ready([], { connections: 0 }), false],
    ['not-found', ready([pluggy({ id: 'outro' })]), false],
    [
      'connection-failed',
      ready([pluggy({ id: 'outro' })], { connections: 2, failedConnections: 1 }),
      false,
    ],
    ['no-value', ready([pluggy({ currentValue: null })]), false],
  ] as const)(
    '%s: o vínculo fica inativo e a posição volta a contar',
    (reason, response, failed) => {
      const r = resolveManualLinks([linked], response, failed);
      expect(r.states.get(1)).toEqual({ kind: 'inactive', reason });
      expect(r.manualCentsCounted).toBe(10000);
      expect(r.coveredManualCents).toBe(0);
      // O vínculo continua registrado — nunca é limpo sozinho.
      expect(r.linkedByPluggyId.get('inv-1')).toEqual([linked]);
      expect(LINK_INACTIVE_REASON_TEXT[reason]).toMatch(/contar? no total/);
    }
  );

  it('vínculo N→1: as duas posições saem do total e aparecem no mesmo id', () => {
    const a = manual({ id: 1, superseded_by_pluggy_investment_id: 'inv-1' });
    const b = manual({ id: 2, invested_amount: 30, superseded_by_pluggy_investment_id: 'inv-1' });
    const r = resolveManualLinks([a, b], ready([pluggy()]), false);
    expect(r.states.get(1)?.kind).toBe('active');
    expect(r.states.get(2)?.kind).toBe('active');
    expect(r.coveredManualCents).toBe(13000);
    expect(r.manualCentsCounted).toBe(0);
    expect(r.linkedByPluggyId.get('inv-1')).toEqual([a, b]);
  });

  it('investimento da Pluggy com id null nunca casa com um vínculo', () => {
    const r = resolveManualLinks([linked], ready([pluggy({ id: null })]), false);
    expect(r.states.get(1)).toEqual({ kind: 'inactive', reason: 'not-found' });
  });
});

describe('pluggyLinkedBadge', () => {
  it('nada vinculado: null', () => {
    expect(pluggyLinkedBadge(undefined)).toBeNull();
    expect(pluggyLinkedBadge([])).toBeNull();
  });
  it('uma posição: nomeia a posição; N: conta', () => {
    expect(pluggyLinkedBadge([manual()])).toBe('Vinculada a "CDB Teste"');
    expect(pluggyLinkedBadge([manual(), manual({ id: 2 })])).toBe('Vinculada a 2 posições suas');
  });
});

describe('rankLinkCandidates', () => {
  it('mesmo vencimento vem antes de valor mais próximo', () => {
    const closeValue = pluggy({ id: 'a', maturityDate: '2031-01-01', currentValue: 100 });
    const sameMaturity = pluggy({ id: 'b', currentValue: 500 });
    expect(rankLinkCandidates(manual(), [closeValue, sameMaturity]).map((c) => c.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('os dois sem vencimento contam como mesmo vencimento', () => {
    const m = manual({ maturity_date: null });
    const dated = pluggy({ id: 'a', currentValue: 100 });
    const daily = pluggy({ id: 'b', maturityDate: null, currentValue: 900 });
    expect(rankLinkCandidates(m, [dated, daily]).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('dentro do mesmo vencimento, menor diferença relativa de valor primeiro; sem valor no fim', () => {
    const far = pluggy({ id: 'far', currentValue: 300 });
    const none = pluggy({ id: 'none', currentValue: null, investedAmount: null });
    const near = pluggy({ id: 'near', currentValue: 105 });
    const invested = pluggy({ id: 'inv', currentValue: null, investedAmount: 130 });
    expect(rankLinkCandidates(manual(), [far, none, near, invested]).map((c) => c.id)).toEqual([
      'near',
      'inv',
      'far',
      'none',
    ]);
  });

  it('empate de vencimento e valor: subtype contendo o kind primeiro; depois a ordem recebida', () => {
    const other = pluggy({ id: 'x', subtype: 'LCI' });
    const noSubtype = pluggy({ id: 'y', subtype: null });
    const match = pluggy({ id: 'z', subtype: 'cdb_pos' });
    expect(rankLinkCandidates(manual(), [other, noSubtype, match]).map((c) => c.id)).toEqual([
      'z',
      'x',
      'y',
    ]);
  });

  it('não esconde candidato pouco parecido; só exclui os sem id', () => {
    const r = rankLinkCandidates(manual(), [
      pluggy({ id: null }),
      pluggy({ id: 'longe', maturityDate: null, subtype: 'TESOURO', currentValue: 99999 }),
    ]);
    expect(r.map((c) => c.id)).toEqual(['longe']);
  });

  it('manual com valor 0 não gera divisão por zero', () => {
    const m = manual({ invested_amount: 0 });
    const r = rankLinkCandidates(m, [
      pluggy({ id: 'a', currentValue: 10 }),
      pluggy({ id: 'b', currentValue: 0 }),
    ]);
    expect(r.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

// T-091d, fatia d4: a conta que o hub de Investimentos fazia inline, extraída
// para a Home somar a mesma RF no patrimônio total.
describe('consolidateFixedIncome', () => {
  // Duas manuais: uma solta (100) e uma vinculada (250) ao investimento da conexão (110).
  const solta = manual({ id: 1, invested_amount: 100 });
  const vinculada = manual({
    id: 2,
    invested_amount: 250,
    superseded_by_pluggy_investment_id: 'inv-1',
  });
  const summary = { totalInvested: 350, totalCurrent: 350 };

  it('vínculo ativo: a manual coberta NÃO conta duas vezes (manual líquida + conexão)', () => {
    const r = consolidateFixedIncome(summary, [solta, vinculada], ready([pluggy()]), false);
    expect(r.manualCents).toBe(10000);
    expect(r.manualCents).toBe(r.links.manualCentsCounted);
    expect(r.pluggyCents).toBe(11000);
    // 100 (solta) + 110 (conexão) — os 250 da vinculada ficam de fora.
    expect(r.totalCents).toBe(21000);
  });

  it('conexão falhou: a vinculada volta a contar e a conexão sai do total', () => {
    const r = consolidateFixedIncome(summary, [solta, vinculada], null, true);
    expect(r.pluggyCents).toBe(0);
    expect(r.totalCents).toBe(35000);
  });

  it('conexão carregando: só a manual inteira, sem somar nada da conexão', () => {
    const r = consolidateFixedIncome(summary, [solta, vinculada], null, false);
    expect(r.totalCents).toBe(35000);
  });

  it('leitura manual indisponível: RF inteira fora (null), mesmo com a conexão pronta', () => {
    const r = consolidateFixedIncome(null, [], ready([pluggy()]), false);
    expect(r.manualCents).toBeUndefined();
    expect(r.pluggyCents).toBe(11000);
    expect(r.totalCents).toBeNull();
  });
});
