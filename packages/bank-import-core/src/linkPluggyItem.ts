import type { Db } from '@vetor-wallet/db';
import { PluggyItemError } from './PluggyItemError';
import { UNKNOWN_PLUGGY_ITEM_STATUS, toPluggyItem, type PluggyItem } from './PluggyItem';

/**
 * Teto de tamanho do `itemId`. Os ids da Pluggy são UUIDs (36 chars); 64 dá
 * folga sem transformar a coluna em campo de texto livre.
 */
export const MAX_PLUGGY_ITEM_ID_LENGTH = 64;

/**
 * Formato aceito de `itemId`: opaco, mas sem espaço, quebra de linha nem
 * controle. Não exigimos UUID exato de propósito (a Pluggy pode mudar o
 * formato); o objetivo é barrar erro de cópia e valor que iria sujo para a
 * querystring do client e para o log.
 */
const ITEM_ID_RE = /^[A-Za-z0-9_.:-]+$/;

export interface LinkPluggyItemParams {
  db: Db;
  userId: number;
  /** UUID da conexão, como a Pluggy o devolve. */
  itemId: string;
  connectorId?: number | null;
  connectorName?: string | null;
  /** Último estado conhecido; default `UNKNOWN`. */
  status?: string | null;
}

/**
 * Registra (ou atualiza) uma conexão da Pluggy para um usuário — idempotente.
 *
 * **A idempotência é do banco** (mesma doutrina da T-084): um único `INSERT …
 * ON CONFLICT(item_id) DO UPDATE … WHERE pluggy_items.user_id = excluded.user_id`
 * resolve os três casos numa instrução atômica, sem SELECT-antes-do-INSERT
 * (TOCTOU):
 *
 * 1. **Item novo** → INSERT.
 * 2. **Mesmo usuário religando o mesmo item** (reconexão é o caminho normal:
 *    o `itemId` sobrevive à reautenticação) → UPDATE de conector/status, sem
 *    linha nova e sem erro.
 * 3. **Item que já é de OUTRO usuário** → o `WHERE` do `DO UPDATE` não casa, o
 *    conflito é resolvido sem escrever nada, e o SELECT seguinte — **filtrado
 *    por `user_id`** — não acha linha. Aí vira `ITEM_ALREADY_LINKED`, mensagem
 *    genérica: o item de outro usuário é invisível, nunca um erro que confirme
 *    de quem é.
 *
 * O SELECT posterior não reintroduz TOCTOU: a escrita já aconteceu de forma
 * atômica e a leitura só projeta o resultado (e nunca enxerga linha alheia).
 */
export async function linkPluggyItem(params: LinkPluggyItemParams): Promise<PluggyItem> {
  const { db, userId } = params;

  const itemId = typeof params.itemId === 'string' ? params.itemId.trim() : '';
  if (!itemId) {
    throw new PluggyItemError('INVALID_ITEM_ID', 'itemId é obrigatório');
  }
  if (itemId.length > MAX_PLUGGY_ITEM_ID_LENGTH) {
    throw new PluggyItemError(
      'INVALID_ITEM_ID',
      `itemId deve ter no máximo ${MAX_PLUGGY_ITEM_ID_LENGTH} caracteres`
    );
  }
  if (!ITEM_ID_RE.test(itemId)) {
    throw new PluggyItemError('INVALID_ITEM_ID', 'itemId tem formato inválido');
  }

  const connectorName = params.connectorName?.trim() || null;
  const connectorId =
    typeof params.connectorId === 'number' && Number.isInteger(params.connectorId)
      ? params.connectorId
      : null;
  const status = params.status?.trim() || UNKNOWN_PLUGGY_ITEM_STATUS;

  await db.execute({
    sql: `INSERT INTO pluggy_items (user_id, item_id, connector_id, connector_name, status)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(item_id) DO UPDATE SET
            connector_id   = COALESCE(excluded.connector_id, pluggy_items.connector_id),
            connector_name = COALESCE(excluded.connector_name, pluggy_items.connector_name),
            status         = excluded.status,
            updated_at     = datetime('now')
          WHERE pluggy_items.user_id = excluded.user_id`,
    args: [userId, itemId, connectorId, connectorName, status],
  });

  const saved = await db.execute({
    sql: `SELECT * FROM pluggy_items WHERE user_id = ? AND item_id = ?`,
    args: [userId, itemId],
  });

  const row = saved.rows[0];
  if (!row) {
    throw new PluggyItemError(
      'ITEM_ALREADY_LINKED',
      'Este item já está vinculado a uma conta e não pode ser reutilizado'
    );
  }

  return toPluggyItem(row);
}
