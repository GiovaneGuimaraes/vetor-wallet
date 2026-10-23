import type { Query } from '@vetor-wallet/query';
import type { IncomeSource, IncomeSourceType } from '@vetor-wallet/shared';

export interface CreateIncomeSourceParams {
  query: Query;
  userId: number;
  name: string;
  type?: IncomeSourceType;
  amount: number;
}

/**
 * Grava uma fonte de renda fixa e devolve a linha criada.
 *
 * `type` ausente vira `'OUTRO'` — o default vem de quando a coluna nasceu e
 * está registrado como débito no `BACKLOG.md` ("default silencioso"): ele
 * aceita um corpo sem `type` em vez de recusar, e quem manda um tipo errado
 * recebe 400 da rota. Mantido aqui para a extração não mudar comportamento.
 *
 * O re-SELECT é filtrado por `user_id` (T-059, simetria com o update — T-051).
 *
 * `RETURNING id` no lugar do `lastInsertRowid` do SQLite (T-114, passo 5 de
 * `docs/multi-agent/plano-migracao-aws.md`) — o mesmo formato nos dois
 * backends do `@vetor-wallet/query`.
 */
export async function createIncomeSource(params: CreateIncomeSourceParams): Promise<IncomeSource> {
  const { query, userId, name, type = 'OUTRO', amount } = params;

  const insert = await query<{ id: number }>({
    text: 'INSERT INTO income_sources (user_id, name, type, amount) VALUES ($1, $2, $3, $4) RETURNING id',
    values: [userId, name.trim(), type, amount],
  });

  const newId = insert.rows[0]?.id ?? 0;
  const row = await query<IncomeSource>({
    text: 'SELECT * FROM income_sources WHERE id = $1 AND user_id = $2',
    values: [newId, userId],
  });
  return row.rows[0];
}
