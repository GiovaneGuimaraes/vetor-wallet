import { pluggyGet } from './pluggyGet';
import { PluggyApiError } from './PluggyApiError';
import { toPluggyTransaction, type PluggyTransaction } from './toPluggyTransaction';

/**
 * `GET /v2/transactions` → todas as transações de uma conta, seguindo o cursor
 * até o fim (T-087).
 *
 * ## Paginação por CURSOR, não por página
 *
 * A v2 devolve `{ results, next }`, onde `next` é a **querystring pronta** do
 * próximo passo (`"?accountId=...&after=..."`) e vem `null` na última página.
 * O critério de parada é `next === null` — e só ele:
 *
 * - "página vazia = fim" é errado (uma página pode vir vazia por filtro e ainda
 *   ter cursor);
 * - contador de páginas/`totalPages` não existe neste endpoint (isso é o
 *   `GET /transactions` por página, **deprecado** — ver `CLAUDE.md`).
 *
 * `MAX_PAGES` é teto **defensivo**, não regra de negócio: um `next` que nunca
 * zera (bug da API ou cursor cíclico) travaria o job para sempre num loop
 * silencioso. Estourar o teto falha alto, com mensagem que diz o que aconteceu.
 */
export const PLUGGY_TRANSACTIONS_PATH = '/v2/transactions';

/** 200 páginas × 500 transações = 100 mil lançamentos; extrato de PF não chega perto. */
export const MAX_PAGES = 200;

export interface FetchPluggyTransactionsParams {
  accountId: string;
  /** `yyyy-mm-dd` (o parâmetro da Pluggy é `dateFrom`, não `from`). */
  dateFrom?: string;
  /** `yyyy-mm-dd` (o parâmetro da Pluggy é `dateTo`, não `to`). */
  dateTo?: string;
}

/** Aceita a querystring pronta do `next` (`?...`) ou um path completo (`/v2/...`). */
function nextPath(next: string): string {
  if (next.startsWith('?')) return `${PLUGGY_TRANSACTIONS_PATH}${next}`;
  if (next.startsWith('/')) return next;
  throw new PluggyApiError(`Cursor \`next\` da Pluggy em formato inesperado: "${next}"`);
}

export async function fetchPluggyTransactions(
  params: FetchPluggyTransactionsParams
): Promise<PluggyTransaction[]> {
  const accountId = params.accountId.trim();
  if (!accountId) throw new PluggyApiError('accountId ausente ao listar transações da Pluggy');

  const query = new URLSearchParams({ accountId });
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);

  const transactions: PluggyTransaction[] = [];
  let path = `${PLUGGY_TRANSACTIONS_PATH}?${query.toString()}`;
  let pages = 0;

  for (;;) {
    const payload = await pluggyGet(path);
    const envelope = (typeof payload === 'object' && payload !== null ? payload : {}) as {
      results?: unknown;
      next?: unknown;
    };

    if (!Array.isArray(envelope.results)) {
      throw new PluggyApiError(
        `Resposta de ${PLUGGY_TRANSACTIONS_PATH} da Pluggy sem a lista \`results\``
      );
    }
    for (const raw of envelope.results) transactions.push(toPluggyTransaction(raw));

    pages++;
    const next =
      typeof envelope.next === 'string' && envelope.next.trim() !== ''
        ? envelope.next.trim()
        : null;
    if (!next) return transactions;

    if (pages >= MAX_PAGES) {
      throw new PluggyApiError(
        `Paginação da Pluggy não terminou em ${MAX_PAGES} páginas (cursor \`next\` ainda ` +
          'preenchido). Abortado para não repetir requests indefinidamente.'
      );
    }
    path = nextPath(next);
  }
}
