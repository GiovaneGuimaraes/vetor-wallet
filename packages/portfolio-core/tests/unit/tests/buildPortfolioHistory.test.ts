import type { Operation } from '@vetor-wallet/shared';
import { buildDateWindow } from 'src/buildDateWindow';
import { buildPortfolioHistory } from 'src/buildPortfolioHistory';
import { shiftDate } from 'src/shiftDate';
import type { SnapshotPoint } from 'src/types';

// Portado do Vitest (portfolioHistory.test.ts) na T-104, fatia 2/2 — assertivas
// intactas. `shiftDate`/`buildDateWindow` foram para arquivos de teste próprios.

// Datas SEMPRE relativas a hoje — nada fixo no calendário.
const TODAY = new Date().toISOString().slice(0, 10);
const d = (delta: number) => shiftDate(TODAY, delta);

let nextId = 1;
function op(
  ticker: string,
  type: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  date: string
): Operation {
  return { id: nextId++, ticker, type, quantity, price, date, created_at: `${date}T10:00:00` };
}

const snap = (ticker: string, date: string, price: number): SnapshotPoint => ({
  ticker,
  date,
  price,
});

describe('buildPortfolioHistory', () => {
  it('returns [] for a portfolio with no operations', () => {
    expect(
      buildPortfolioHistory([], [snap('PETR4', d(-2), 10)], buildDateWindow(TODAY, 5))
    ).toEqual([]);
  });

  it('forward-fills the last known price across a hole in the middle of the series', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-5))];
    // sem snapshot em d(-4): o dia herda o preço de d(-5) em vez de virar um vale
    const snaps = [snap('PETR4', d(-5), 10), snap('PETR4', d(-3), 12)];

    const points = buildPortfolioHistory(ops, snaps, [d(-5), d(-4), d(-3)]);

    expect(points).toEqual([
      { date: d(-5), value: 100, invested: 100 },
      { date: d(-4), value: 100, invested: 100 },
      { date: d(-3), value: 120, invested: 100 },
    ]);
  });

  it('omits days before the first operation', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-4))];
    const snaps = [snap('PETR4', d(-4), 10)];

    const points = buildPortfolioHistory(ops, snaps, [d(-6), d(-5), d(-4)]);

    expect(points.map((p) => p.date)).toEqual([d(-4)]);
  });

  // Seed do forward-fill (achado nº 1 da revisão da T-058a).
  it('seeds the forward-fill with the price of the first BUY when the ticker has no snapshot yet', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-4))];
    const snaps: SnapshotPoint[] = []; // nenhuma coleta aconteceu ainda

    const points = buildPortfolioHistory(ops, snaps, [d(-5), d(-4), d(-3), d(-2)]);

    // a série começa no dia da compra, ao preço pago — não fica truncada
    expect(points).toEqual([
      { date: d(-4), value: 100, invested: 100 },
      { date: d(-3), value: 100, invested: 100 },
      { date: d(-2), value: 100, invested: 100 },
    ]);
  });

  it('lets the first snapshot take over from the seeded buy price', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-4))];
    const snaps = [snap('PETR4', d(-2), 11)];

    const points = buildPortfolioHistory(ops, snaps, [d(-4), d(-3), d(-2), d(-1)]);

    expect(points).toEqual([
      { date: d(-4), value: 100, invested: 100 }, // seed da compra
      { date: d(-3), value: 100, invested: 100 },
      { date: d(-2), value: 110, invested: 100 }, // fechamento assume
      { date: d(-1), value: 110, invested: 100 },
    ]);
  });

  it('does not let a later BUY override an already known closing price', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-4)), op('PETR4', 'BUY', 10, 9, d(-2))];
    const snaps = [snap('PETR4', d(-3), 15)];

    const points = buildPortfolioHistory(ops, snaps, [d(-3), d(-2)]);

    // o preço da segunda compra (9) NÃO substitui o fechamento conhecido (15)
    expect(points).toEqual([
      { date: d(-3), value: 150, invested: 100 },
      { date: d(-2), value: 300, invested: 190 },
    ]);
  });

  it('lets a same-day snapshot win over the seed of the buy', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-2))];
    const snaps = [snap('PETR4', d(-2), 12)];

    const points = buildPortfolioHistory(ops, snaps, [d(-2)]);

    expect(points).toEqual([{ date: d(-2), value: 120, invested: 100 }]);
  });

  it('uses a snapshot older than the window as the forward-fill base of day 1', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-30))];
    const snaps = [snap('PETR4', d(-20), 15)];

    const points = buildPortfolioHistory(ops, snaps, [d(-2), d(-1)]);

    expect(points).toEqual([
      { date: d(-2), value: 150, invested: 100 },
      { date: d(-1), value: 150, invested: 100 },
    ]);
  });

  // Antes do seed, comprar um ticker inédito truncava a série inteira até o
  // primeiro snapshot dele — inclusive a parte já conhecida dos outros tickers.
  it('does not truncate the series when a brand-new ticker enters the portfolio', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-3)), op('VALE3', 'BUY', 2, 50, d(-2))];
    const snaps = [snap('PETR4', d(-3), 10), snap('VALE3', d(-1), 60)];

    const points = buildPortfolioHistory(ops, snaps, [d(-3), d(-2), d(-1)]);

    expect(points).toEqual([
      { date: d(-3), value: 100, invested: 100 },
      // VALE3 ainda sem fechamento: entra pelo preço de compra (2 × 50)
      { date: d(-2), value: 200, invested: 200 },
      { date: d(-1), value: 220, invested: 200 },
    ]);
  });

  // O descarte por "ticker detido sem preço" virou defesa inalcançável: só um
  // BUY (que sempre tem preço) cria quantidade positiva, então todo ticker
  // detido tem base de forward-fill por construção.
  it('never drops a day for missing price once every held ticker came from a BUY', () => {
    const ops = [
      op('PETR4', 'BUY', 10, 10, d(-4)),
      op('VALE3', 'BUY', 3, 40, d(-3)),
      op('ITUB4', 'BUY', 5, 20, d(-2)),
    ];

    const points = buildPortfolioHistory([...ops], [], [d(-4), d(-3), d(-2), d(-1)]);

    expect(points.map((p) => p.date)).toEqual([d(-4), d(-3), d(-2), d(-1)]);
    expect(points[3]).toEqual({ date: d(-1), value: 320, invested: 320 });
  });

  it('reduces the position on the exact date of the SELL', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-4)), op('PETR4', 'SELL', 4, 20, d(-2))];
    const snaps = [snap('PETR4', d(-4), 10)];

    const points = buildPortfolioHistory(ops, snaps, [d(-4), d(-3), d(-2), d(-1)]);

    expect(points).toEqual([
      { date: d(-4), value: 100, invested: 100 },
      { date: d(-3), value: 100, invested: 100 },
      // a venda entra já no próprio dia: 6 × 10
      { date: d(-2), value: 60, invested: 60 },
      { date: d(-1), value: 60, invested: 60 },
    ]);
  });

  it('keeps a day with the position fully sold as a real zero (not a hole)', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-3)), op('PETR4', 'SELL', 10, 20, d(-2))];
    const snaps = [snap('PETR4', d(-3), 10)];

    const points = buildPortfolioHistory(ops, snaps, [d(-3), d(-2)]);

    expect(points).toEqual([
      { date: d(-3), value: 100, invested: 100 },
      { date: d(-2), value: 0, invested: 0 },
    ]);
  });

  it('keeps the weighted average cost of buildPositionMap (two BUYs at different prices)', () => {
    const ops = [op('PETR4', 'BUY', 10, 10, d(-3)), op('PETR4', 'BUY', 10, 20, d(-2))];
    const snaps = [snap('PETR4', d(-3), 10)];

    const points = buildPortfolioHistory(ops, snaps, [d(-3), d(-2)]);

    // preço médio 15 sobre 20 ações = 300 de custo; valor ainda no fechamento de 10
    expect(points[1]).toEqual({ date: d(-2), value: 200, invested: 300 });
  });

  it('rounds value and invested to cents', () => {
    const ops = [op('PETR4', 'BUY', 3, 10.1, d(-1))];
    const snaps = [snap('PETR4', d(-1), 10.1)];

    const points = buildPortfolioHistory(ops, snaps, [d(-1)]);

    expect(points).toEqual([{ date: d(-1), value: 30.3, invested: 30.3 }]);
  });

  it('returns [] when the window is empty', () => {
    expect(buildPortfolioHistory([op('PETR4', 'BUY', 1, 1, d(-1))], [], [])).toEqual([]);
  });

  // ── Testes novos da fatia 2/2 (T-104): o que a trava de 100% expôs ──

  it('ordena operações e fechamentos por data, mesmo vindo fora de ordem e com empates', () => {
    const buy1 = op('PETR4', 'BUY', 10, 10, d(-3));
    const buy2 = op('VALE3', 'BUY', 2, 50, d(-3));
    const sell = op('PETR4', 'SELL', 5, 20, d(-1));
    const snaps = [
      snap('VALE3', d(-1), 60),
      snap('PETR4', d(-3), 10),
      snap('PETR4', d(-1), 12),
      snap('VALE3', d(-3), 50),
    ];
    const dates = [d(-3), d(-2), d(-1)];

    const inOrder = buildPortfolioHistory([buy1, buy2, sell], [...snaps].reverse(), dates);
    const shuffled = buildPortfolioHistory([sell, buy2, buy1], snaps, dates);

    expect(shuffled).toEqual(inOrder);
    expect(shuffled).toEqual([
      { date: d(-3), value: 200, invested: 200 },
      { date: d(-2), value: 200, invested: 200 },
      { date: d(-1), value: 180, invested: 150 },
    ]);
  });

  // A defesa "ticker detido sem preço" é inalcançável com dado bem formado (ver
  // o teste acima de "never drops a day"). O único caminho até ela é uma linha
  // corrompida — BUY sem preço — e aí o dia some em vez de virar um número
  // errado.
  it('drops the day instead of guessing when a held ticker has no usable price (defesa)', () => {
    const corrupted = {
      ...op('PETR4', 'BUY', 10, 10, d(-2)),
      price: undefined,
    } as unknown as Operation;

    expect(buildPortfolioHistory([corrupted], [], [d(-2), d(-1)])).toEqual([]);
  });
});
