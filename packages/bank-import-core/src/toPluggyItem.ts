import type { PluggyItem } from './PluggyItem';

/** Projeta a linha do banco no tipo do domínio (nomes camelCase). */
export function toPluggyItem(row: Record<string, unknown>): PluggyItem {
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
