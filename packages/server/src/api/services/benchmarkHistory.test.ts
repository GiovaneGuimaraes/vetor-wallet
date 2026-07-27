import { describe, it, expect } from 'vitest';
import {
  brapiRangeForDays,
  buildCdiIndexSeries,
  buildIbovespaSeries,
  clampSeriesToWindow,
} from './benchmarkHistory';

describe('buildCdiIndexSeries', () => {
  it('acumula as taxas diárias em índice base 100 e converte dd/mm/yyyy para ISO', () => {
    const series = buildCdiIndexSeries([
      { data: '02/01/2026', valor: '0,050000' },
      { data: '05/01/2026', valor: '0,050000' },
    ]);

    expect(series).toHaveLength(2);
    expect(series[0].date).toBe('2026-01-02');
    expect(series[0].value).toBeCloseTo(100.05, 6);
    expect(series[1].date).toBe('2026-01-05');
    expect(series[1].value).toBeCloseTo(100.05 * 1.0005, 6);
  });

  it('a razão entre dois pontos é a rentabilidade do intervalo (independe da base)', () => {
    const series = buildCdiIndexSeries([
      { data: '02/01/2026', valor: '0,040000' },
      { data: '05/01/2026', valor: '0,040000' },
      { data: '06/01/2026', valor: '0,040000' },
    ]);
    expect(series[2].value / series[0].value).toBeCloseTo(1.0004 * 1.0004, 8);
  });

  it('descarta linhas com data em formato inesperado ou valor não numérico', () => {
    const series = buildCdiIndexSeries([
      { data: '2026-01-02', valor: '0,05' },
      { data: '05/01/2026', valor: 'n/d' },
      { data: '06/01/2026', valor: '0,10' },
    ]);
    expect(series.map((p) => p.date)).toEqual(['2026-01-06']);
    expect(series[0].value).toBeCloseTo(100.1, 6);
  });

  it('série vazia devolve []', () => {
    expect(buildCdiIndexSeries([])).toEqual([]);
  });
});

describe('buildIbovespaSeries', () => {
  const ts = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime() / 1000;

  it('converte epoch em data ISO e ordena por data', () => {
    const series = buildIbovespaSeries([
      { date: ts('2026-01-05'), close: 130000 },
      { date: ts('2026-01-02'), close: 128000 },
    ]);
    expect(series).toEqual([
      { date: '2026-01-02', value: 128000 },
      { date: '2026-01-05', value: 130000 },
    ]);
  });

  it('deduplica por data mantendo o último fechamento e descarta close inválido', () => {
    const series = buildIbovespaSeries([
      { date: ts('2026-01-02'), close: 128000 },
      { date: ts('2026-01-02'), close: 128500 },
      { date: ts('2026-01-03'), close: 0 },
      { date: ts('2026-01-06'), close: Number.NaN },
    ]);
    expect(series).toEqual([{ date: '2026-01-02', value: 128500 }]);
  });

  it('histórico vazio devolve []', () => {
    expect(buildIbovespaSeries([])).toEqual([]);
  });
});

describe('clampSeriesToWindow', () => {
  it('mantém apenas os pontos dentro do intervalo, inclusive nas bordas', () => {
    const series = [
      { date: '2026-01-01', value: 1 },
      { date: '2026-01-05', value: 2 },
      { date: '2026-01-10', value: 3 },
    ];
    expect(clampSeriesToWindow(series, '2026-01-05', '2026-01-10')).toEqual([
      { date: '2026-01-05', value: 2 },
      { date: '2026-01-10', value: 3 },
    ]);
    expect(clampSeriesToWindow(series, '2026-02-01', '2026-02-10')).toEqual([]);
  });
});

describe('brapiRangeForDays', () => {
  it('escolhe o menor range que cobre a janela pedida', () => {
    expect(brapiRangeForDays(30)).toBe('3mo');
    expect(brapiRangeForDays(31)).toBe('6mo');
    expect(brapiRangeForDays(90)).toBe('6mo');
    expect(brapiRangeForDays(365)).toBe('2y');
    expect(brapiRangeForDays(900)).toBe('5y');
  });
});
