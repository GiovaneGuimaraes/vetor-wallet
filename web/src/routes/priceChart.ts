import type { Operation, Position, QuoteSnapshot } from '@vetor-wallet/shared';
import { computeValueDomain, type ValueDomain } from './chartGeometry';

/**
 * Matemática pura do card "Preço por ação" em `/dash` (T-060) — consome
 * `GET /api/snapshots/:ticker` (existente desde antes da T-058). Irmão de
 * `historyChart.ts`: mesmo padrão de eixo X por ÍNDICE do ponto (a série de
 * fechamentos tem buracos de fim de semana/feriado, não é contígua) e
 * reaproveita `computeValueDomain` de `chartGeometry.ts` para o domínio do
 * eixo Y — aqui a "baseline" que o domínio deve cobrir é o preço médio de
 * compra (quando existir), não um valor inicial de simulação.
 */

/**
 * Preço médio de compra do usuário num ticker, derivado das operações já
 * carregadas no cliente (não existe `buildPositionMap` no web — replicado
 * aqui com a MESMA semântica do server, `applyOperation`/`buildPositionMap`
 * em `server/src/services/portfolio.ts`: média ponderada das BUYs
 * remanescentes, SELL reduz quantidade sem alterar o preço médio).
 *
 * As operações do ticker são ordenadas por `date` ASC (desempate por `id`
 * ASC, resolução de segundos de `created_at` — mesmo padrão usado em outros
 * pontos do app, ex. `findDefaultWallet`) antes de aplicar, pois
 * `GET /api/operations` devolve em ordem DESC e a ordem de aplicação importa
 * para o cálculo (uma SELL processada fora de ordem pode ficar negativa e
 * ser clampada, distorcendo o resultado).
 *
 * Devolve `null` quando a posição foi zerada (tudo vendido) ou não há
 * nenhuma BUY do ticker — nesses casos não existe preço médio para exibir
 * como referência no gráfico.
 */
export function computeAveragePrice(operations: Operation[], ticker: string): number | null {
  const ordered = operations
    .filter((op) => op.ticker === ticker)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));

  let quantity = 0;
  let avgPrice = 0;

  for (const op of ordered) {
    if (op.type === 'BUY') {
      const totalCost = quantity * avgPrice + op.quantity * op.price;
      const newQty = quantity + op.quantity;
      avgPrice = newQty > 0 ? totalCost / newQty : 0;
      quantity = newQty;
    } else {
      quantity = Math.max(0, quantity - op.quantity);
    }
  }

  return quantity > 0 ? avgPrice : null;
}

/**
 * Escolhe o ticker default do seletor: a maior alocação (`allocationPct`)
 * dentre as posições atuais. Posições com `allocationPct` nulo (cotação
 * indisponível) vão por último — nunca vencem o default sobre uma posição
 * com alocação conhecida. Em empate/todas nulas, a primeira da lista vence
 * (ordem estável, sem critério adicional). `[]` devolve `null` — nenhum
 * ticker para selecionar, o card fica oculto (mesmo guard dos outros cards
 * de gráfico da dash).
 */
export function selectDefaultTicker(positions: Position[]): string | null {
  if (positions.length === 0) return null;
  let best = positions[0];
  for (const pos of positions.slice(1)) {
    const bestPct = best.allocationPct ?? -Infinity;
    const pct = pos.allocationPct ?? -Infinity;
    if (pct > bestPct) best = pos;
  }
  return best.ticker;
}

/**
 * Data (`YYYY-MM-DD`) de início da janela de `days` dias terminando em
 * `referenceDate` (inclusive) — enviada como `?from=` para
 * `GET /api/snapshots/:ticker`, evitando trafegar o histórico inteiro do
 * ticker. Mesma aritmética de `shiftDate` (`services/portfolioHistory.ts`,
 * server): `Date.UTC` + acessores UTC, sem armadilha de fuso horário.
 */
export function computeFromDate(days: number, referenceDate: Date = new Date()): string {
  const ms = referenceDate.getTime() - Math.max(0, days) * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Extrai a data (`YYYY-MM-DD`) de um `captured_at` (formato
 * `YYYY-MM-DD HH:MM:SS`, gravado por `datetime('now')`/o job de snapshots) —
 * necessário porque `formatDayMonth` (`expenseMonth.ts`) exige a string
 * EXATA `YYYY-MM-DD` e rejeitaria o datetime completo por regex.
 */
export function snapshotDate(capturedAt: string): string {
  return capturedAt.slice(0, 10);
}

/**
 * Domínio do eixo Y (preço) cobrindo os fechamentos da janela E o preço
 * médio de referência, quando houver — reusa `computeValueDomain` de
 * `chartGeometry.ts` (mesma margem de 10%/piso absoluto). Sem preço médio
 * (`avgPrice === null`), a baseline cai para o primeiro preço da série (já
 * incluso em `prices`, então não distorce o domínio) — ou `0` para série
 * vazia.
 */
export function computePriceDomain(prices: number[], avgPrice: number | null): ValueDomain {
  const baseline = avgPrice ?? prices[0] ?? 0;
  return computeValueDomain(prices, baseline);
}

/**
 * Tendência da série de fechamentos (último vs. primeiro) — decide a cor da
 * linha, mesma semântica de P&L do resto do app. Menos de 2 pontos não tem
 * "de-para" e é tratado como neutro (`false`).
 */
export function isPriceSeriesDown(snapshots: QuoteSnapshot[]): boolean {
  if (snapshots.length < 2) return false;
  return snapshots[snapshots.length - 1].price < snapshots[0].price;
}
