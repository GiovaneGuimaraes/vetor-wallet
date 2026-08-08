import { db } from '@vetor-wallet/db';
import type { Goal } from '@vetor-wallet/shared';

/**
 * Agregado dos lançamentos de poupança vinculados a uma meta (T-024).
 * `net` = soma de DEPOSIT − soma de WITHDRAW (YIELD fica fora: rateio de
 * rendimento entre metas está fora de escopo, e por isso `POST /api/savings`
 * rejeita `goalId` em lançamentos YIELD).
 */
export interface GoalLinkAggregate {
  count: number;
  net: number;
}

/** Arredonda para centavos, evitando ruído de ponto flutuante (0.1 + 0.2). */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Uma query agregada por usuário (GROUP BY goal_id) — sem N+1 por meta.
 * Metas sem lançamentos vinculados simplesmente não aparecem no Map.
 */
export async function fetchGoalLinkAggregates(
  userId: number
): Promise<Map<number, GoalLinkAggregate>> {
  const result = await db.execute({
    sql: `SELECT goal_id,
                 COUNT(*) AS linked_count,
                 SUM(CASE type
                       WHEN 'DEPOSIT'  THEN amount
                       WHEN 'WITHDRAW' THEN -amount
                       ELSE 0
                     END) AS linked_net
          FROM savings_entries
          WHERE user_id = ? AND goal_id IS NOT NULL
          GROUP BY goal_id`,
    args: [userId],
  });

  const map = new Map<number, GoalLinkAggregate>();
  for (const row of result.rows as unknown as {
    goal_id: number;
    linked_count: number;
    linked_net: number | null;
  }[]) {
    map.set(Number(row.goal_id), {
      count: Number(row.linked_count),
      net: Number(row.linked_net ?? 0),
    });
  }
  return map;
}

/**
 * Aplica o progresso derivado sobre a linha crua de `goals` (lógica pura).
 *
 * - sem lançamentos vinculados → `MANUAL`, `current_amount` intocado
 *   (retrocompatibilidade com as metas criadas antes da T-024);
 * - com lançamentos vinculados → `LINKED_SAVINGS`, `current_amount` derivado.
 *   O piso é 0: retiradas vinculadas acima dos aportes não geram progresso
 *   negativo (progresso negativo de meta não tem significado no produto).
 */
export function resolveGoalProgress(goal: Goal, aggregate: GoalLinkAggregate | undefined): Goal {
  if (!aggregate || aggregate.count === 0) {
    return {
      ...goal,
      current_amount: Number(goal.current_amount),
      progress_source: 'MANUAL',
      linked_entries_count: 0,
    };
  }
  return {
    ...goal,
    current_amount: roundCents(Math.max(0, aggregate.net)),
    progress_source: 'LINKED_SAVINGS',
    linked_entries_count: aggregate.count,
  };
}

/** Lista as metas do usuário já com o progresso resolvido (2 queries no total). */
export async function listGoalsWithProgress(userId: number): Promise<Goal[]> {
  const [goalsResult, aggregates] = await Promise.all([
    db.execute({
      sql: 'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId],
    }),
    fetchGoalLinkAggregates(userId),
  ]);

  return (goalsResult.rows as unknown as Goal[]).map((goal) =>
    resolveGoalProgress(goal, aggregates.get(Number(goal.id)))
  );
}

/** Progresso resolvido de uma única meta (usado por POST/PATCH). */
export async function getGoalWithProgress(userId: number, goalId: number): Promise<Goal | null> {
  const goalResult = await db.execute({
    sql: 'SELECT * FROM goals WHERE id = ? AND user_id = ?',
    args: [goalId, userId],
  });
  const goal = (goalResult.rows as unknown as Goal[])[0];
  if (!goal) return null;

  return resolveGoalProgress(goal, await getGoalLinkAggregate(userId, goalId));
}

/** Agregado de uma única meta — usado para bloquear o PATCH de `current_amount`. */
export async function getGoalLinkAggregate(
  userId: number,
  goalId: number
): Promise<GoalLinkAggregate | undefined> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS linked_count,
                 SUM(CASE type
                       WHEN 'DEPOSIT'  THEN amount
                       WHEN 'WITHDRAW' THEN -amount
                       ELSE 0
                     END) AS linked_net
          FROM savings_entries
          WHERE user_id = ? AND goal_id = ?`,
    args: [userId, goalId],
  });
  const row = (result.rows as unknown as { linked_count: number; linked_net: number | null }[])[0];
  if (!row || Number(row.linked_count) === 0) return undefined;
  return { count: Number(row.linked_count), net: Number(row.linked_net ?? 0) };
}
