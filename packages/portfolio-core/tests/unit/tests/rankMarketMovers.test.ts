import { rankMarketMovers, MIN_TRADED_VALUE_BRL } from 'src/rankMarketMovers';
import type { MarketQuote } from '@vetor-wallet/shared';

// Valores inventados. `volume` em ações: 1_000_000 × R$ 10 = R$ 10 mi (acima do piso).
const q = (ticker: string, change: number, over: Partial<MarketQuote> = {}): MarketQuote => ({
  ticker,
  name: ticker,
  close: 10,
  change,
  volume: 1_000_000,
  marketCap: 1e9,
  sector: null,
  ...over,
});

describe('rankMarketMovers', () => {
  it('ordena altas por variação decrescente e baixas por crescente, limitando a 5', () => {
    const universe = [
      ...[1, 2, 3, 4, 5, 6].map((n) => q(`UP${n}`, n)),
      ...[-1, -2, -3, -4, -5, -6].map((n) => q(`DN${-n}`, n)),
    ];
    const r = rankMarketMovers(universe);
    expect(r.gainers.map((x) => x.ticker)).toEqual(['UP6', 'UP5', 'UP4', 'UP3', 'UP2']);
    expect(r.losers.map((x) => x.ticker)).toEqual(['DN6', 'DN5', 'DN4', 'DN3', 'DN2']);
  });

  it('ativo estável (change 0) não entra em altas nem em baixas', () => {
    const r = rankMarketMovers([q('FLAT', 0), q('UP', 1), q('DN', -1)]);
    expect(r.gainers.map((x) => x.ticker)).toEqual(['UP']);
    expect(r.losers.map((x) => x.ticker)).toEqual(['DN']);
  });

  it('ordena mais negociadas por volume financeiro (close × volume), não por quantidade', () => {
    const r = rankMarketMovers([
      q('MANY', 1, { close: 2, volume: 10_000_000 }), // R$ 20 mi
      q('PRICEY', 1, { close: 100, volume: 400_000 }), // R$ 40 mi
    ]);
    expect(r.mostTraded.map((x) => x.ticker)).toEqual(['PRICEY', 'MANY']);
  });

  it('descarta o que está abaixo do piso de liquidez, sem valor de mercado ou abaixo de R$ 1', () => {
    const r = rankMarketMovers([
      q('ILLIQ', 50, { volume: 1 }),
      q('NOCAP', 40, { marketCap: null }),
      q('PENNY', 30, { close: 0.35, volume: 100_000_000 }),
      q('OK', 5),
    ]);
    expect(r.gainers.map((x) => x.ticker)).toEqual(['OK']);
    expect(r.mostTraded.map((x) => x.ticker)).toEqual(['OK']);
  });

  it('aceita exatamente o piso e expõe o valor do piso na resposta', () => {
    const edge = q('EDGE', 1, { close: 10, volume: MIN_TRADED_VALUE_BRL / 10 });
    const r = rankMarketMovers([edge]);
    expect(r.gainers).toHaveLength(1);
    expect(r.minTradedValue).toBe(MIN_TRADED_VALUE_BRL);
  });

  it('desempata por ticker e não muta a entrada', () => {
    const universe = [q('BBB', 2), q('AAA', 2)];
    const copy = [...universe];
    expect(rankMarketMovers(universe).gainers.map((x) => x.ticker)).toEqual(['AAA', 'BBB']);
    expect(universe).toEqual(copy);
  });

  it('universo vazio devolve listas vazias', () => {
    const r = rankMarketMovers([]);
    expect(r.gainers).toEqual([]);
    expect(r.losers).toEqual([]);
    expect(r.mostTraded).toEqual([]);
  });

  it('em altas/baixas mantém só a classe mais líquida de cada empresa; mais negociadas não dedupa', () => {
    const universe = [
      q('RENT3', 15, { volume: 2_000_000 }),
      q('RENT4', 16, { volume: 5_000_000 }),
      q('OTHR3', 5),
      q('LOSA3', -9, { volume: 3_000_000 }),
      q('LOSA4', -8, { volume: 1_000_000 }),
    ];
    const r = rankMarketMovers(universe);
    expect(r.gainers.map((x) => x.ticker)).toEqual(['RENT4', 'OTHR3']);
    expect(r.losers.map((x) => x.ticker)).toEqual(['LOSA3']);
    expect(r.mostTraded.map((x) => x.ticker)).toEqual([
      'RENT4',
      'LOSA3',
      'RENT3',
      'LOSA4',
      'OTHR3',
    ]);
  });
});
