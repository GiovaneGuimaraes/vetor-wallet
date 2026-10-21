import { pluggyGet } from './pluggyGet';
import { PluggyApiError } from './PluggyApiError';
import { toPluggyInvestment, type PluggyInvestment } from './toPluggyInvestment';

/**
 * `GET /investments?itemId=<uuid>` → todos os investimentos do item, página a
 * página até o fim (T-091d, fatia d1).
 *
 * ## Paginação por PÁGINA, não por cursor
 *
 * Diferente de `/v2/transactions` (cursor `next`), a doc de `/investments`
 * documenta `page` (default 1) e `pageSize` (default 500) na query, e o
 * envelope `{ results, page, total, totalPages }` — o mesmo do `/accounts`. O
 * critério de parada é `page >= totalPages`, e só ele:
 *
 * - página vazia no meio **não** é fim (mesma doutrina do cursor);
 * - `totalPages` ausente ou não-inteiro é **erro**, não "uma página só": sem ele
 *   não há como saber se a lista acabou, e "achei 0 investimentos" seria
 *   indistinguível de "não li o resto";
 * - `totalPages: 0` (item sem investimento) encerra na primeira página.
 *
 * `MAX_PAGES` é teto defensivo: um `totalPages` absurdo falha alto antes de
 * disparar milhares de requests.
 */
export const PLUGGY_INVESTMENTS_PATH = '/investments';

/** Default documentado pela Pluggy; explícito para a paginação não depender dele. */
export const PLUGGY_INVESTMENTS_PAGE_SIZE = 500;

/** 50 × 500 = 25 mil posições; carteira de PF não chega perto. */
export const MAX_INVESTMENT_PAGES = 50;

export async function fetchPluggyInvestments(itemId: string): Promise<PluggyInvestment[]> {
  const id = itemId.trim();
  if (!id) throw new PluggyApiError('itemId ausente ao listar investimentos da Pluggy');

  const investments: PluggyInvestment[] = [];

  for (let page = 1; ; page++) {
    const query = new URLSearchParams({
      itemId: id,
      page: String(page),
      pageSize: String(PLUGGY_INVESTMENTS_PAGE_SIZE),
    });

    let payload: unknown;
    try {
      payload = await pluggyGet(`${PLUGGY_INVESTMENTS_PATH}?${query.toString()}`);
    } catch (err) {
      if (err instanceof PluggyApiError && (err.status === 404 || err.status === 403)) {
        // O itemId NÃO entra na mensagem: é credencial portadora (ver
        // `maskItemId` no cli) e mensagem de erro acaba em print e PR.
        throw new PluggyApiError(
          `Pluggy não encontrou o item ao listar investimentos (HTTP ${err.status}). ` +
            'O item tem de pertencer à MESMA aplicação de PLUGGY_CLIENT_ID e estar ' +
            'vinculado ao usuário (pluggy:link).',
          err.status
        );
      }
      throw err;
    }

    const envelope = (typeof payload === 'object' && payload !== null ? payload : {}) as {
      results?: unknown;
      totalPages?: unknown;
    };

    if (!Array.isArray(envelope.results)) {
      throw new PluggyApiError(
        `Resposta de ${PLUGGY_INVESTMENTS_PATH} da Pluggy sem a lista \`results\``
      );
    }
    const totalPages = envelope.totalPages;
    if (typeof totalPages !== 'number' || !Number.isInteger(totalPages) || totalPages < 0) {
      throw new PluggyApiError(
        `Resposta de ${PLUGGY_INVESTMENTS_PATH} da Pluggy sem \`totalPages\` válido — ` +
          'impossível saber se a lista terminou'
      );
    }
    if (totalPages > MAX_INVESTMENT_PAGES) {
      throw new PluggyApiError(
        `Pluggy anunciou ${totalPages} páginas de investimentos (teto ${MAX_INVESTMENT_PAGES}). ` +
          'Abortado para não disparar requests indefinidamente.'
      );
    }

    for (const raw of envelope.results) investments.push(toPluggyInvestment(raw));

    if (page >= totalPages) return investments;
  }
}
