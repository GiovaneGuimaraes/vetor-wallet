import type { Row } from '@libsql/client';

/**
 * Uma conexão do usuário com uma instituição financeira via Pluggy — o "item"
 * (T-089a).
 *
 * Antes desta tabela o `itemId` era `PLUGGY_ITEM_ID` no `.env` do `cli`: uma
 * instalação, um usuário. Aqui ele é dado por usuário, o que é pré-requisito de
 * qualquer coisa multi-usuário (rota, botão, gatilho de sync).
 *
 * O item é **credencial portadora**: quem tem o `itemId` lê o extrato daquela
 * conexão. Daí a unicidade GLOBAL de `item_id` no banco (ver `schema.ts`) e a
 * regra de que toda leitura filtra por `user_id` — item de outro usuário é
 * **invisível**, nunca um 403 que confirme a existência.
 */
export interface PluggyItem {
  id: number;
  userId: number;
  /** UUID da conexão na Pluggy. */
  itemId: string;
  /** Id do conector (instituição) na Pluggy; `null` quando não informado. */
  connectorId: number | null;
  connectorName: string | null;
  /** Último estado conhecido na Pluggy (`UPDATED`, `LOGIN_ERROR`…). Cache. */
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Estado inicial quando quem registra o item não sabe o estado dele. */
export const UNKNOWN_PLUGGY_ITEM_STATUS = 'UNKNOWN';

/** Projeta a linha do banco no tipo do domínio (nomes camelCase). */
export function toPluggyItem(row: Row): PluggyItem {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    itemId: String(row.item_id),
    connectorId: row.connector_id === null ? null : Number(row.connector_id),
    connectorName: row.connector_name === null ? null : String(row.connector_name),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
