import { describe, it, expect } from 'vitest';
import type { Operation, PortfolioSummary } from '@vetor-wallet/shared';
import {
  deriveMonthlyReturnPct,
  parseSignedInput,
  projectPortfolio,
  resolveDefaultCurrentValue,
} from './portfolioProjection';
import { currentMonthKey, shiftMonth } from './expenseMonth';

let nextId = 1;

/**
 * Operação de compra/venda para os testes. As datas são sempre **relativas**
 * ao mês corrente (`shiftMonth`), nunca fixas — `deriveMonthlyReturnPct`
 * depende de "hoje" para calcular `elapsedMonths`, e datas cravadas
 * envelheceriam a suíte (mesmo padrão de `savingsProjection.test.ts`).
 */
function makeOp(type: Operation['type'], quantity: number, price: number, date: string): Operation {
  return {
    id: nextId++,
    ticker: 'PETR4',
    type,
    quantity,
    price,
    date,
    created_at: date,
  };
}

/**
 * `YYYY-MM-DD` no mês deslocado `delta` meses a partir do mês corrente. O dia
 * default é o dia-do-mês de HOJE (clampado a 28, para nunca cair fora de um
 * mês curto) — isso mantém `elapsedMonths` (calculado por
 * `deriveMonthlyReturnPct` a partir de "agora") bem próximo do inteiro
 * `-delta`, sem depender de qual dia do mês o teste roda.
 */
function dayIn(delta: number, day = Math.min(new Date().getDate(), 28)): string {
  return `${shiftMonth(currentMonthKey(), delta)}-${String(day).padStart(2, '0')}`;
}

/** Recorta um `Pick<PortfolioSummary, ...>` mínimo para os testes. */
function makeSummary(
  totalProfitLossPct: number | null,
  totalInvested: number
): Pick<PortfolioSummary, 'totalProfitLossPct' | 'totalInvested'> {
  return { totalProfitLossPct, totalInvested };
}

describe('projectPortfolio', () => {
  it('aplica juros compostos mensais', () => {
    // 1000 × 1,01^12 = 1126,825…
    expect(projectPortfolio(1000, 1, 12)).toEqual({
      futureValue: 1126.83,
      totalGain: 126.83,
      totalContributed: 0,
    });
  });

  it('prazo 0 devolve o próprio valor atual e ganho zero', () => {
    expect(projectPortfolio(1000, 0.9, 0)).toEqual({
      futureValue: 1000,
      totalGain: 0,
      totalContributed: 0,
    });
  });

  it('taxa 0 não altera o valor em nenhum prazo', () => {
    expect(projectPortfolio(2500, 0, 36)).toEqual({
      futureValue: 2500,
      totalGain: 0,
      totalContributed: 0,
    });
  });

  it('taxa negativa projeta perda (divergência deliberada da T-040)', () => {
    // 1000 × 0,99^12 = 886,384…
    const result = projectPortfolio(1000, -1, 12);
    expect(result).not.toBeNull();
    expect(result!.futureValue).toBeCloseTo(886.38, 2);
    expect(result!.totalGain).toBeLessThan(0);
  });

  it('valor atual 0 é simulação válida e não rende nada, mesmo com taxa negativa', () => {
    expect(projectPortfolio(0, -50, 24)).toEqual({
      futureValue: 0,
      totalGain: 0,
      totalContributed: 0,
    });
  });

  it('curto-circuita valor atual 0 mesmo com taxa/prazo extremos que estourariam Math.pow', () => {
    expect(projectPortfolio(0, 100, 5000)).toEqual({
      futureValue: 0,
      totalGain: 0,
      totalContributed: 0,
    });
  });

  it('rejeita taxa -100 e abaixo', () => {
    expect(projectPortfolio(1000, -100, 12)).toBeNull();
    expect(projectPortfolio(1000, -150, 12)).toBeNull();
  });

  it('aceita taxa levemente acima de -100', () => {
    const result = projectPortfolio(1000, -99.9, 1);
    expect(result).not.toBeNull();
  });

  it('arredonda em centavos e mantém atual + ganho = valor futuro', () => {
    const result = projectPortfolio(1234.56, -0.87, 7);
    expect(result).not.toBeNull();
    const { futureValue, totalGain } = result!;
    expect(futureValue).toBe(Math.round(futureValue * 100) / 100);
    expect(totalGain).toBe(Math.round(totalGain * 100) / 100);
    expect(Math.round((1234.56 + totalGain) * 100) / 100).toBe(futureValue);
  });

  it('rejeita entradas inválidas', () => {
    expect(projectPortfolio(Number.NaN, 1, 12)).toBeNull();
    expect(projectPortfolio(1000, Number.NaN, 12)).toBeNull();
    expect(projectPortfolio(1000, 1, Number.NaN)).toBeNull();
    expect(projectPortfolio(Number.POSITIVE_INFINITY, 1, 12)).toBeNull();
    expect(projectPortfolio(-1, 1, 12)).toBeNull();
    expect(projectPortfolio(1000, 1, -3)).toBeNull();
    expect(projectPortfolio(1000, 1, 12.5)).toBeNull();
  });

  it('rejeita resultado que estoura o alcance de number', () => {
    expect(projectPortfolio(1e308, 100, 5000)).toBeNull();
  });

  it('suporta prazo longo (600 meses)', () => {
    const result = projectPortfolio(1000, 0.5, 600);
    expect(result).not.toBeNull();
    expect(result!.futureValue).toBeGreaterThan(1000);
    expect(Number.isFinite(result!.futureValue)).toBe(true);
  });

  // ---------------------------------------------------------------------
  // T-062 — aporte mensal recorrente
  // ---------------------------------------------------------------------

  it('T-062: aporte ausente é idêntico a aporte 0 (retrocompatibilidade)', () => {
    expect(projectPortfolio(1000, 1, 12, 0)).toEqual(projectPortfolio(1000, 1, 12));
    expect(projectPortfolio(0, -50, 24, 0)).toEqual(projectPortfolio(0, -50, 24));
    expect(projectPortfolio(2500, 0, 36, 0)).toEqual(projectPortfolio(2500, 0, 36));
  });

  it('T-062: aporte > 0 compõe pela anuidade ordinária', () => {
    expect(projectPortfolio(1000, 1, 12, 100)).toEqual({
      futureValue: 2395.08,
      totalGain: 195.08,
      totalContributed: 1200,
    });
  });

  it('T-062: taxa 0 com aporte devolve VP + A × n, sem ganho', () => {
    expect(projectPortfolio(2500, 0, 12, 250)).toEqual({
      futureValue: 5500,
      totalGain: 0,
      totalContributed: 3000,
    });
  });

  it('T-062: valor atual 0 com aporte > 0 é simulação válida (não devolve null)', () => {
    expect(projectPortfolio(0, 1, 12, 100)).toEqual({
      futureValue: 1268.25,
      totalGain: 68.25,
      totalContributed: 1200,
    });
  });

  it('T-062: taxa NEGATIVA com aporte não produz NaN/Infinity', () => {
    // A fórmula da anuidade com i < 0 é matematicamente válida: numerador e
    // denominador são ambos negativos, então o termo do aporte é positivo — e
    // menor que A × n, porque cada aporte encolhe até o fim do prazo.
    // 1000 × 0,99^12 = 886,3848… ; 100 × (0,99^12 − 1)/(−0,01) = 1136,1512…
    const result = projectPortfolio(1000, -1, 12, 100);
    expect(result).toEqual({
      futureValue: 2022.54,
      totalGain: -177.46,
      totalContributed: 1200,
    });
    expect(Number.isFinite(result!.futureValue)).toBe(true);
    // O aporte perde valor: o "ganho" é negativo mesmo tendo entrado dinheiro.
    expect(result!.futureValue).toBeLessThan(1000 + 1200);
  });

  it('T-062: taxa negativa extrema (perto de -100%) com aporte segue finita', () => {
    const result = projectPortfolio(1000, -99.99, 24, 500);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.futureValue)).toBe(true);
    expect(Number.isFinite(result!.totalGain)).toBe(true);
    // Com queda quase total mensal, só o aporte do último mês sobrevive.
    expect(result!.futureValue).toBeGreaterThan(0);
    expect(result!.totalGain).toBeLessThan(0);
  });

  it('T-062: prazo 0 com aporte não aporta nada', () => {
    expect(projectPortfolio(1000, 0.9, 0, 500)).toEqual({
      futureValue: 1000,
      totalGain: 0,
      totalContributed: 0,
    });
  });

  it('T-062: mantém atual + aportes + ganho = valor futuro em centavos', () => {
    const result = projectPortfolio(1234.56, -0.87, 7, 321.99);
    expect(result).not.toBeNull();
    const { futureValue, totalGain, totalContributed } = result!;
    expect(futureValue).toBe(Math.round(futureValue * 100) / 100);
    expect(totalGain).toBe(Math.round(totalGain * 100) / 100);
    expect(totalContributed).toBe(Math.round(321.99 * 7 * 100) / 100);
    expect(Math.round((1234.56 + totalContributed + totalGain) * 100)).toBe(
      Math.round(futureValue * 100)
    );
  });

  it('T-062: rejeita aporte negativo ou não finito', () => {
    // Aporte negativo seria uma retirada mensal — cenário fora do escopo do
    // simulador, e a assimetria com a TAXA (que pode ser negativa) é
    // deliberada.
    expect(projectPortfolio(1000, 1, 12, -1)).toBeNull();
    expect(projectPortfolio(1000, 1, 12, Number.NaN)).toBeNull();
    expect(projectPortfolio(1000, 1, 12, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('T-062: com aporte > 0 o estouro de number volta a devolver null mesmo com valor atual 0', () => {
    expect(projectPortfolio(0, 100, 5000, 100)).toBeNull();
  });
});

describe('deriveMonthlyReturnPct', () => {
  it('devolve null sem nenhuma operação', () => {
    expect(deriveMonthlyReturnPct([], makeSummary(10, 1000))).toBeNull();
  });

  it('devolve null quando totalProfitLossPct é null (cotações indisponíveis)', () => {
    const ops = [makeOp('BUY', 10, 30, dayIn(-6))];
    expect(deriveMonthlyReturnPct(ops, makeSummary(null, 300))).toBeNull();
  });

  it('devolve null quando totalInvested é 0 ou negativo', () => {
    const ops = [makeOp('BUY', 10, 30, dayIn(-6))];
    expect(deriveMonthlyReturnPct(ops, makeSummary(10, 0))).toBeNull();
    expect(deriveMonthlyReturnPct(ops, makeSummary(10, -5))).toBeNull();
  });

  it('devolve null quando a carteira tem menos de 1 mês de idade', () => {
    const ops = [makeOp('BUY', 10, 30, dayIn(0))];
    expect(deriveMonthlyReturnPct(ops, makeSummary(2, 300))).toBeNull();
  });

  it('deriva a taxa geométrica de um único aporte', () => {
    // 6 meses atrás, +12,68% acumulado → taxa mensal composta ~2%.
    const ops = [makeOp('BUY', 10, 30, dayIn(-6))];
    const rate = deriveMonthlyReturnPct(ops, makeSummary(12.68, 300));
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(2, 1);
  });

  it('pondera a data média pelo valor investido (compra grande recente x pequena antiga)', () => {
    const opsRecentHeavy = [
      makeOp('BUY', 1, 10, dayIn(-12)), // pequena e antiga: pouco peso
      makeOp('BUY', 100, 10, dayIn(-1)), // grande e recente: domina a média
    ];
    const rateRecentHeavy = deriveMonthlyReturnPct(opsRecentHeavy, makeSummary(5, 1010));

    const opsOldHeavy = [
      makeOp('BUY', 100, 10, dayIn(-12)), // grande e antiga: domina a média
      makeOp('BUY', 1, 10, dayIn(-1)), // pequena e recente: pouco peso
    ];
    const rateOldHeavy = deriveMonthlyReturnPct(opsOldHeavy, makeSummary(5, 1010));

    expect(rateRecentHeavy).not.toBeNull();
    expect(rateOldHeavy).not.toBeNull();
    // Mesmo P&L, mas a carteira "recente" está investida há menos tempo em
    // média → taxa mensal implícita maior para gerar o mesmo retorno total.
    expect(rateRecentHeavy!).toBeGreaterThan(rateOldHeavy!);
  });

  it('P&L negativo deriva taxa mensal negativa', () => {
    const ops = [makeOp('BUY', 10, 30, dayIn(-6))];
    const rate = deriveMonthlyReturnPct(ops, makeSummary(-10, 300));
    expect(rate).not.toBeNull();
    expect(rate!).toBeLessThan(0);
  });

  it('ignora operações SELL na data média ponderada', () => {
    const opsWithSell = [
      makeOp('BUY', 10, 30, dayIn(-6)),
      makeOp('SELL', 5, 35, dayIn(0)), // recente: se entrasse, puxaria a data média para hoje
    ];
    const opsBuyOnly = [makeOp('BUY', 10, 30, dayIn(-6))];

    const rateWithSell = deriveMonthlyReturnPct(opsWithSell, makeSummary(12.68, 300));
    const rateBuyOnly = deriveMonthlyReturnPct(opsBuyOnly, makeSummary(12.68, 300));
    expect(rateWithSell).toBe(rateBuyOnly);
  });

  it('devolve null para pct exatamente -100 (guarda explícita, T-056b)', () => {
    const ops = [makeOp('BUY', 10, 30, dayIn(-6))];
    expect(deriveMonthlyReturnPct(ops, makeSummary(-100, 300))).toBeNull();
  });

  it('devolve null para pct abaixo de -100 (mesmo motivo do caso -100)', () => {
    const ops = [makeOp('BUY', 10, 30, dayIn(-6))];
    expect(deriveMonthlyReturnPct(ops, makeSummary(-150, 300))).toBeNull();
  });

  it('a taxa derivada alimenta projectPortfolio', () => {
    const ops = [makeOp('BUY', 10, 100, dayIn(-12))];
    const rate = deriveMonthlyReturnPct(ops, makeSummary(20, 1000));
    expect(rate).not.toBeNull();
    const projection = projectPortfolio(1200, rate!, 12);
    expect(projection).not.toBeNull();
    // Projetando a mesma taxa pelo mesmo prazo em que ela foi observada, o
    // ganho projetado é proporcionalmente coerente com o P&L original.
    expect(projection!.futureValue).toBeGreaterThan(1200);
  });
});

describe('parseSignedInput', () => {
  it('aceita vírgula decimal', () => {
    expect(parseSignedInput('1234,56')).toBe(1234.56);
    expect(parseSignedInput(' 0,9 ')).toBe(0.9);
  });

  it('aceita negativo', () => {
    expect(parseSignedInput('-1,5')).toBe(-1.5);
    expect(parseSignedInput('-100')).toBe(-100);
  });

  it('aceita zero', () => {
    expect(parseSignedInput('0')).toBe(0);
  });

  it('rejeita vazio, texto e infinito', () => {
    expect(parseSignedInput('')).toBeNull();
    expect(parseSignedInput('   ')).toBeNull();
    expect(parseSignedInput('abc')).toBeNull();
    expect(parseSignedInput('Infinity')).toBeNull();
    expect(parseSignedInput('-Infinity')).toBeNull();
  });
});

describe('resolveDefaultCurrentValue', () => {
  it('usa totalCurrentValue quando disponível', () => {
    expect(resolveDefaultCurrentValue({ totalCurrentValue: 1500, totalInvested: 1200 })).toEqual({
      value: 1500,
      usedFallback: false,
    });
  });

  it('cai para totalInvested quando totalCurrentValue é null (cotações indisponíveis)', () => {
    expect(resolveDefaultCurrentValue({ totalCurrentValue: null, totalInvested: 1200 })).toEqual({
      value: 1200,
      usedFallback: true,
    });
  });

  it('devolve 0 sem fallback quando não há summary', () => {
    expect(resolveDefaultCurrentValue(null)).toEqual({ value: 0, usedFallback: false });
  });
});
