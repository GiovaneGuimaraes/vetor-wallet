import { describe, it, expect } from 'vitest';
import type { BenchmarkSeriesPoint, PortfolioHistoryPoint } from '@vetor-wallet/shared';
import {
  alignBenchmarkSeries,
  buildBenchmarkLine,
  collectLineValues,
  rebaseToPortfolio,
  splitSegments,
} from './benchmarkSeries';

const point = (date: string, value: number, invested = 0): PortfolioHistoryPoint => ({
  date,
  value,
  invested,
});
const bench = (date: string, value: number): BenchmarkSeriesPoint => ({ date, value });

describe('alignBenchmarkSeries', () => {
  it('faz forward-fill dos buracos internos (fim de semana/feriado)', () => {
    const aligned = alignBenchmarkSeries(
      [bench('2026-01-02', 100), bench('2026-01-05', 110)],
      ['2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']
    );
    expect(aligned).toEqual([100, 100, 100, 110]);
  });

  it('estende o último valor conhecido até o fim da janela', () => {
    const aligned = alignBenchmarkSeries([bench('2026-01-02', 100)], ['2026-01-02', '2026-01-03']);
    expect(aligned).toEqual([100, 100]);
  });

  it('deixa null nas datas anteriores ao primeiro ponto do benchmark (sem back-fill)', () => {
    const aligned = alignBenchmarkSeries(
      [bench('2026-01-03', 100)],
      ['2026-01-01', '2026-01-02', '2026-01-03']
    );
    expect(aligned).toEqual([null, null, 100]);
  });

  it('ordena a série de entrada e ignora valores não finitos', () => {
    const aligned = alignBenchmarkSeries(
      [bench('2026-01-05', 110), bench('2026-01-02', 100), bench('2026-01-03', Number.NaN)],
      ['2026-01-02', '2026-01-03', '2026-01-05']
    );
    expect(aligned).toEqual([100, 100, 110]);
  });

  it('série vazia devolve só nulls; datas vazias devolvem []', () => {
    expect(alignBenchmarkSeries([], ['2026-01-02', '2026-01-03'])).toEqual([null, null]);
    expect(alignBenchmarkSeries([bench('2026-01-02', 100)], [])).toEqual([]);
  });
});

describe('rebaseToPortfolio', () => {
  it('ancora no primeiro índice comparável: a linha vale o valor da carteira ali', () => {
    const rebased = rebaseToPortfolio([100, 110, 121], [1000, 900, 800]);
    expect(rebased).toEqual([1000, 1100, 1210]);
  });

  it('preserva a rentabilidade relativa do benchmark, não seus valores absolutos', () => {
    const rebased = rebaseToPortfolio([50, 55], [200, 210]) as number[];
    expect(rebased[1] / rebased[0]).toBeCloseTo(55 / 50, 10);
  });

  it('período parcial: a âncora é o primeiro dia com dado do benchmark', () => {
    const rebased = rebaseToPortfolio([null, null, 100, 110], [900, 950, 1000, 1100]);
    // Antes da âncora não há linha; na âncora ela encosta na carteira (1000).
    expect(rebased).toEqual([null, null, 1000, 1100]);
  });

  it('devolve null quando a âncora é zero (divisão por zero no ponto de partida)', () => {
    expect(rebaseToPortfolio([0, 110], [1000, 1100])).toBeNull();
  });

  it('devolve null sem nenhum índice comparável, com tamanhos diferentes ou vazio', () => {
    expect(rebaseToPortfolio([null, null], [1000, 1100])).toBeNull();
    expect(rebaseToPortfolio([100], [1000, 1100])).toBeNull();
    expect(rebaseToPortfolio([], [])).toBeNull();
  });

  it('ignora índices em que a carteira não tem valor finito ao escolher a âncora', () => {
    const rebased = rebaseToPortfolio([100, 110], [Number.NaN, 1100]) as (number | null)[];
    expect(rebased[1]).toBe(1100);
  });
});

describe('buildBenchmarkLine', () => {
  const points = [point('2026-01-02', 1000), point('2026-01-03', 1010), point('2026-01-05', 1020)];

  it('compõe alinhamento + rebase em uma linha em reais', () => {
    const line = buildBenchmarkLine(
      [bench('2026-01-02', 100), bench('2026-01-05', 102)],
      points
    ) as number[];
    expect(line[0]).toBe(1000);
    expect(line[1]).toBe(1000); // forward-fill do dia sem dado
    expect(line[2]).toBeCloseTo(1020, 10); // +2% sobre 1000
  });

  it('série ausente/vazia ou histórico vazio devolvem null', () => {
    expect(buildBenchmarkLine(null, points)).toBeNull();
    expect(buildBenchmarkLine(undefined, points)).toBeNull();
    expect(buildBenchmarkLine([], points)).toBeNull();
    expect(buildBenchmarkLine([bench('2026-01-02', 100)], [])).toBeNull();
  });

  it('benchmark inteiramente posterior à janela devolve null (nada comparável)', () => {
    expect(buildBenchmarkLine([bench('2026-02-01', 100)], points)).toBeNull();
  });
});

describe('collectLineValues', () => {
  it('reúne os valores presentes das linhas, ignorando nulls e linhas ausentes', () => {
    expect(collectLineValues([[1, null, 2], null, undefined, [3]])).toEqual([1, 2, 3]);
  });

  it('sem nenhuma linha visível devolve []', () => {
    expect(collectLineValues([])).toEqual([]);
    expect(collectLineValues([null, [null, null]])).toEqual([]);
  });
});

describe('splitSegments', () => {
  it('quebra em segmentos contíguos, sem atravessar o buraco', () => {
    expect(splitSegments([1, 2, null, 3, 4])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('buraco no início/fim não gera segmento vazio', () => {
    expect(splitSegments([null, null, 1, 2])).toEqual([[1, 2]]);
    expect(splitSegments([1, 2, null])).toEqual([[1, 2]]);
    expect(splitSegments([null])).toEqual([]);
    expect(splitSegments([])).toEqual([]);
  });

  it('mantém segmentos de um único ponto', () => {
    expect(splitSegments([1, null, 2])).toEqual([[1], [2]]);
  });
});
