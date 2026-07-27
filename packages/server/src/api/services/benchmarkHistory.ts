import type { BenchmarkSeriesPoint } from '@vetor-wallet/shared';

/**
 * Séries históricas de CDI e Ibovespa para a comparação do gráfico
 * "Evolução da carteira" (T-068).
 *
 * `GET /api/benchmarks` (pré-existente) devolve só **um número** por
 * benchmark — a rentabilidade acumulada do período inteiro da carteira. Isso
 * não serve para desenhar uma LINHA ao longo do tempo, então a T-068 precisou
 * de séries diárias: este módulo é a parte pura (parse + acumulação), e as
 * duas funções de `fetch` são casca fina em volta das mesmas APIs que
 * `benchmarks.ts` já usa (BCB SGS 12 para o CDI, brapi `^BVSP` para o
 * Ibovespa), com o mesmo timeout de 5s e a mesma política de devolver `null`
 * em qualquer falha (a comparação é um extra do gráfico — nunca derruba a
 * request).
 *
 * **Base do índice**: as séries saem daqui em base 100 no primeiro ponto
 * (CDI) ou em pontos de fechamento absolutos (Ibovespa). A normalização que
 * importa para o gráfico é feita no CLIENTE
 * (`packages/web/src/routes/benchmarkSeries.ts`), que reancora cada série no
 * primeiro dia comparável da janela EXIBIDA e a converte para reais — o
 * server não sabe qual janela o usuário está olhando nem o valor da carteira
 * naquele dia.
 */

const FETCH_TIMEOUT_MS = 5000;

/** Taxa diária do CDI como o BCB devolve: data `dd/mm/yyyy` e valor em % com vírgula. */
export interface BcbRateRow {
  data: string;
  valor: string;
}

function bcbDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function isoToBcbDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Converte as taxas DIÁRIAS do CDI em uma série de índice acumulado
 * (base 100 antes do primeiro dia): o ponto de cada data vale
 * `100 × Π (1 + taxa_j/100)` para todas as taxas até ela, inclusive.
 *
 * Ou seja, o primeiro ponto já inclui o rendimento do próprio primeiro dia —
 * o valor absoluto da base é irrelevante porque o cliente reancora a série
 * (razão entre pontos), e a razão entre dois pontos quaisquer é a
 * rentabilidade correta do intervalo entre eles.
 *
 * Linhas com data em formato inesperado ou valor não numérico são
 * DESCARTADAS (a série do BCB é pública e ocasionalmente traz buracos); a
 * ordem de saída segue a ordem de entrada, que o BCB devolve cronológica.
 */
export function buildCdiIndexSeries(rows: BcbRateRow[]): BenchmarkSeriesPoint[] {
  const points: BenchmarkSeriesPoint[] = [];
  let accumulated = 100;

  for (const row of rows) {
    const date = bcbDateToIso(String(row?.data ?? ''));
    if (date === null) continue;
    const pct = Number(String(row?.valor ?? '').replace(',', '.'));
    if (!Number.isFinite(pct)) continue;

    accumulated *= 1 + pct / 100;
    points.push({ date, value: accumulated });
  }

  return points;
}

/** Ponto de histórico da brapi: `date` é epoch em SEGUNDOS, `close` o fechamento. */
export interface BrapiHistoryPoint {
  date: number;
  close: number;
}

/**
 * Converte o histórico da brapi em série `{ date: YYYY-MM-DD, value: close }`
 * ordenada por data, descartando pontos sem fechamento positivo/finito e
 * deduplicando por data (o último ponto de uma data vence — é o fechamento
 * mais recente conhecido dela).
 */
export function buildIbovespaSeries(history: BrapiHistoryPoint[]): BenchmarkSeriesPoint[] {
  const byDate = new Map<string, number>();

  for (const point of history) {
    const ts = Number(point?.date);
    const close = Number(point?.close);
    if (!Number.isFinite(ts) || !Number.isFinite(close) || close <= 0) continue;
    const date = new Date(ts * 1000).toISOString().split('T')[0];
    byDate.set(date, close);
  }

  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Menor `range` da brapi que cobre `days` dias de histórico. A brapi só
 * aceita um conjunto fechado de valores; pedir mais que o necessário só
 * traria tráfego extra, e pedir menos truncaria a linha do benchmark antes do
 * início da janela.
 */
export function brapiRangeForDays(days: number): string {
  if (days <= 30) return '3mo';
  if (days <= 90) return '6mo';
  if (days <= 365) return '2y';
  return '5y';
}

/** Recorta a série ao intervalo `[from, to]` (inclusivo, comparação lexicográfica de ISO). */
export function clampSeriesToWindow(
  series: BenchmarkSeriesPoint[],
  from: string,
  to: string,
): BenchmarkSeriesPoint[] {
  return series.filter((p) => p.date >= from && p.date <= to);
}

/**
 * Série diária do CDI acumulado entre `from` e `to`. `null` em qualquer
 * falha (HTTP, timeout, JSON inesperado, série vazia).
 */
export async function fetchCdiSeries(
  from: string,
  to: string,
): Promise<BenchmarkSeriesPoint[] | null> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${isoToBcbDate(
    from,
  )}&dataFinal=${isoToBcbDate(to)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as BcbRateRow[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const series = buildCdiIndexSeries(data);
    return series.length > 0 ? series : null;
  } catch {
    return null;
  }
}

/**
 * Série diária de fechamento do Ibovespa (`^BVSP`) cobrindo `days` dias,
 * recortada a `[from, to]`. `null` em qualquer falha.
 */
export async function fetchIbovespaSeries(
  from: string,
  to: string,
  days: number,
): Promise<BenchmarkSeriesPoint[] | null> {
  const token = process.env.BRAPI_TOKEN;
  const tokenParam = token ? `&token=${token}` : '';
  const range = brapiRangeForDays(days);
  const url = `https://brapi.dev/api/quote/%5EBVSP?range=${range}&interval=1d&fundamental=false&history=true${tokenParam}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: { historicalDataPrice?: BrapiHistoryPoint[] }[];
    };
    const history = data.results?.[0]?.historicalDataPrice;
    if (!Array.isArray(history) || history.length === 0) return null;

    const series = clampSeriesToWindow(buildIbovespaSeries(history), from, to);
    return series.length > 0 ? series : null;
  } catch {
    return null;
  }
}
