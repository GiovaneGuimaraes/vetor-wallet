import { bcbDateToIso } from 'src/bcbDateToIso';
import { isoToBcbDate } from 'src/isoToBcbDate';
import { brapiRangeForDays } from 'src/brapiRangeForDays';
import { buildCdiIndexSeries } from 'src/buildCdiIndexSeries';
import { buildIbovespaSeries } from 'src/buildIbovespaSeries';
import { clampSeriesToWindow } from 'src/clampSeriesToWindow';

describe('isoToBcbDate / bcbDateToIso', () => {
  it('converte ISO para dd/mm/yyyy e de volta', () => {
    expect(isoToBcbDate('2026-01-05')).toBe('05/01/2026');
    expect(bcbDateToIso('05/01/2026')).toBe('2026-01-05');
  });

  it('formato inesperado vira null', () => {
    expect(bcbDateToIso('2026-01-05')).toBeNull();
  });
});

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

  it('tolera linhas nulas e série vazia', () => {
    expect(buildCdiIndexSeries([null as never, undefined as never])).toEqual([]);
    // valor ausente vira '' → 0% (comportamento original preservado)
    expect(buildCdiIndexSeries([{ data: '05/01/2026', valor: undefined as never }])).toEqual([
      { date: '2026-01-05', value: 100 },
    ]);
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

  it('deduplica por data mantendo o último fechamento e descarta close/data inválidos', () => {
    const series = buildIbovespaSeries([
      { date: ts('2026-01-02'), close: 128000 },
      { date: ts('2026-01-02'), close: 128500 },
      { date: ts('2026-01-03'), close: 0 },
      { date: ts('2026-01-06'), close: Number.NaN },
      { date: Number.NaN, close: 100 },
      null as never,
    ]);
    expect(series).toEqual([{ date: '2026-01-02', value: 128500 }]);
  });

  it('histórico vazio devolve []', () => {
    expect(buildIbovespaSeries([])).toEqual([]);
  });

  // T-119: a rota ancora a janela em BRT (UTC-3); datar em UTC jogava o candle
  // das 21h+ BRT para "amanhã", fora da janela.
  const epoch = (utcIso: string) => new Date(utcIso).getTime() / 1000;

  it('data o candle em BRT: 00:30Z é 21:30 BRT do dia anterior', () => {
    expect(buildIbovespaSeries([{ date: epoch('2026-03-10T00:30:00Z'), close: 1 }])).toEqual([
      { date: '2026-03-09', value: 1 },
    ]);
  });

  it('borda 21:00 BRT (00:00Z) ainda é o dia anterior; 02:59Z também', () => {
    const series = buildIbovespaSeries([
      { date: epoch('2026-03-10T02:59:59Z'), close: 1 },
      { date: epoch('2026-03-10T03:00:00Z'), close: 2 },
    ]);
    expect(series).toEqual([
      { date: '2026-03-09', value: 1 },
      { date: '2026-03-10', value: 2 },
    ]);
  });

  it('virada de mês e de ano em BRT', () => {
    expect(
      buildIbovespaSeries([
        { date: epoch('2026-04-01T01:00:00Z'), close: 1 },
        { date: epoch('2027-01-01T02:00:00Z'), close: 2 },
      ])
    ).toEqual([
      { date: '2026-03-31', value: 1 },
      { date: '2026-12-31', value: 2 },
    ]);
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
    expect(brapiRangeForDays(91)).toBe('2y');
    expect(brapiRangeForDays(365)).toBe('2y');
    expect(brapiRangeForDays(900)).toBe('5y');
  });
});
