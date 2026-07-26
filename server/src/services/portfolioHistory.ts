import type { Operation, PortfolioHistoryPoint } from '@vetor-wallet/shared';
import { buildPositionMap } from './portfolio';

/**
 * Um preço de fechamento conhecido de um ticker num dia (uma linha de
 * `quote_snapshots` já reduzida ao par data/preço). `date` é `YYYY-MM-DD`.
 */
export interface SnapshotPoint {
  ticker: string;
  date: string;
  price: number;
}

/** Arredonda em centavos — a série é exibida em BRL, não faz sentido carregar ruído de float. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Desloca uma data `YYYY-MM-DD` em `delta` dias (aritmética em UTC, sem
 * armadilha de fuso — mesma abordagem de `isValidIsoDate` em `services/dates.ts`).
 */
export function shiftDate(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + delta * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Os `days` dias da janela que TERMINA em `endDateISO` (inclusive), em ordem
 * crescente. `days = 1` devolve só o próprio `endDateISO`.
 */
export function buildDateWindow(endDateISO: string, days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    dates.push(shiftDate(endDateISO, -i));
  }
  return dates;
}

/**
 * Série histórica de valor de mercado × custo da carteira, um ponto por dia da
 * janela (T-058a).
 *
 * Para cada dia:
 * - a **quantidade detida** sai de `buildPositionMap` sobre as operações com
 *   `date <= dia` — a MESMA função do cálculo de preço médio do `/api/portfolio`,
 *   sem nenhuma reimplementação da regra de preço médio ponderado aqui;
 * - o **preço** é o último fechamento conhecido do ticker com data `<= dia`
 *   (forward-fill). `quote_snapshots` só tem linha nos dias em que o job rodou
 *   (fim de semana, feriado e dia de server desligado ficam vazios); sem o
 *   forward-fill cada buraco viraria um vale falso no gráfico.
 * - o forward-fill é **semeado pelo preço da primeira BUY** de cada ticker, na
 *   data dela, quando ainda não há nenhum fechamento conhecido para ele. O
 *   preço pago é um preço real e conhecido; sem o seed, comprar um ticker
 *   inédito truncava a série inteira do dia da compra até o primeiro snapshot
 *   — o que, com a coleta rodando só no boot do server, pode levar dias.
 *   Snapshots posteriores continuam sobrepondo o seed normalmente; um snapshot
 *   ANTERIOR já conhecido **não** é sobreposto pela compra (o fechamento é a
 *   fonte preferida sempre que existe).
 *
 * Semântica de `invested`: **custo de aquisição das posições ainda detidas
 * naquela data** — `Σ quantidade × preço médio`, exatamente o `totalInvested`
 * que `buildPortfolioSummary` expõe hoje no dashboard. Não é "dinheiro
 * aportado acumulado": uma venda reduz `invested` na proporção da posição
 * vendida (o preço médio não muda numa venda), então a linha de custo e a de
 * valor continuam comparáveis ponto a ponto — que é o uso da série.
 *
 * Dias ausentes da resposta (o cliente preenche/interpola — mesmo precedente do
 * `/summary` da T-033, que omite meses sem lançamento):
 * - dias anteriores à primeira operação do usuário (não havia carteira ainda);
 * - dias em que **algum** ticker detido não tem nenhum preço conhecido até ali.
 *   Isso é mais rigoroso que "nenhum preço conhecido": somar só a parte com
 *   preço devolveria um valor silenciosamente subestimado, exatamente o vale
 *   falso que o forward-fill existe para evitar. Ausente é honesto — o cliente
 *   consegue ver o buraco; um número errado ele não consegue.
 *   **Com o seed da primeira BUY esse segundo caso é inalcançável por
 *   construção** (só um BUY, que tem preço, cria quantidade positiva) — o
 *   descarte fica como defesa, não como caminho esperado.
 *
 * Um dia sem NENHUMA posição aberta (tudo vendido) **entra** com `value` e
 * `invested` zerados: é um zero verdadeiro, não um buraco de dados. Já uma
 * carteira sem nenhuma operação devolve `[]`.
 *
 * Função pura: recebe operações e snapshots já lidos do banco (o filtro por
 * `user_id` mora na query de `operations`; `quote_snapshots` não tem dono —
 * preço é global).
 */
export function buildPortfolioHistory(
  ops: Operation[],
  snapshots: SnapshotPoint[],
  dates: string[],
): PortfolioHistoryPoint[] {
  if (ops.length === 0 || dates.length === 0) return [];

  // Ordenação estável por data: empates preservam a ordem de entrada (a query
  // já vem com `ORDER BY date ASC, created_at ASC`).
  const sortedOps = [...ops].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const sortedSnaps = [...snapshots].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const firstOpDate = sortedOps[0].date;
  const lastPrice = new Map<string, number>();
  const points: PortfolioHistoryPoint[] = [];

  let opIdx = 0;
  let snapIdx = 0;

  for (const date of dates) {
    while (opIdx < sortedOps.length && sortedOps[opIdx].date <= date) {
      const op = sortedOps[opIdx];
      // Seed do forward-fill: o preço pago na primeira BUY de um ticker sem
      // nenhum fechamento conhecido ainda. Só preenche buraco — nunca sobrepõe
      // um preço já conhecido (fechamento é a fonte preferida). Como o laço de
      // snapshots roda DEPOIS deste, um snapshot do mesmo dia ainda vence o seed.
      if (op.type === 'BUY' && !lastPrice.has(op.ticker)) lastPrice.set(op.ticker, op.price);
      opIdx += 1;
    }
    while (snapIdx < sortedSnaps.length && sortedSnaps[snapIdx].date <= date) {
      const snap = sortedSnaps[snapIdx];
      lastPrice.set(snap.ticker, snap.price);
      snapIdx += 1;
    }

    if (date < firstOpDate) continue;

    const positionMap = buildPositionMap(sortedOps.slice(0, opIdx));

    let value = 0;
    let invested = 0;
    let missingPrice = false;

    for (const [ticker, pos] of positionMap.entries()) {
      if (pos.quantity <= 0) continue;
      const price = lastPrice.get(ticker);
      if (price === undefined) {
        missingPrice = true;
        break;
      }
      value += pos.quantity * price;
      invested += pos.quantity * pos.avgPrice;
    }

    if (missingPrice) continue;

    points.push({ date, value: roundCents(value), invested: roundCents(invested) });
  }

  return points;
}
