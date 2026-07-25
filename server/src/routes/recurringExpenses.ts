import { Router, Request, Response } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { RecurringExpenseUpdate } from '@vetor-wallet/shared';

/**
 * Gestão dos templates de recorrência mensal de despesa (T-035).
 *
 * **Não há POST aqui de propósito**: uma recorrência sempre nasce junto de um
 * lançamento, via `POST /api/expense-entries` com `recurring: true`. Isso
 * garante que (a) o mês inicial (`start_month`) é sempre o mês daquele
 * lançamento — sem ambiguidade de fuso — e (b) a primeira ocorrência é o
 * próprio lançamento criado, já registrada no livro-razão de meses gerados.
 *
 * "Encerrar" é sempre **soft** (`active = 0` + `ended_at`), nunca um DELETE de
 * linha: as ocorrências já materializadas referenciam o template em
 * `expense_entries.recurring_id`, e o livro-razão precisa continuar existindo
 * para que nada seja re-materializado.
 */
const router = Router();

router.use(requireAuth);

/** Lista apenas as recorrências ATIVAS — encerradas saem da gestão da UI. */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const result = await db.execute({
      sql: `SELECT * FROM recurring_expenses
            WHERE user_id = ? AND active = 1
            ORDER BY created_at DESC, id DESC`,
      args: [userId],
    });
    res.json(result.rows);
  }),
);

async function endRecurrence(id: string, userId: number): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE recurring_expenses SET active = 0, ended_at = datetime('now')
          WHERE id = ? AND user_id = ? AND active = 1`,
    args: [id, userId],
  });
  if (result.rowsAffected > 0) return true;

  // Já encerrada é idempotente (200/204); inexistente ou de outro usuário é 404.
  const existing = await db.execute({
    sql: 'SELECT id FROM recurring_expenses WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return existing.rows.length > 0;
}

/**
 * Encerra a recorrência. O único campo aceito é `active: false` — editar
 * descrição/valor/dia do template está fora do escopo da T-035 (mudaria o
 * significado das ocorrências futuras sem tocar nas passadas).
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const { active } = req.body as RecurringExpenseUpdate;

    if (active === undefined) {
      res.status(400).json({ error: 'informe active: false para encerrar a recorrência' });
      return;
    }
    if (typeof active !== 'boolean') {
      res.status(400).json({ error: 'active deve ser booleano' });
      return;
    }
    if (active) {
      // Reativar reabriria a janela de meses entre o encerramento e hoje, que
      // seriam materializados de uma vez no próximo GET — comportamento
      // surpreendente. Quem quiser voltar a recorrência cria outra.
      res
        .status(400)
        .json({ error: 'não é possível reativar uma recorrência — crie uma nova' });
      return;
    }

    const found = await endRecurrence(id, userId);
    if (!found) {
      res.status(404).json({ error: 'Recorrência não encontrada' });
      return;
    }

    const row = await db.execute({
      sql: 'SELECT * FROM recurring_expenses WHERE id = ?',
      args: [id],
    });
    res.json(row.rows[0]);
  }),
);

/** Alias de encerrar — não apaga o template (ver doc do módulo). */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const found = await endRecurrence(req.params.id, userId);
    if (!found) {
      res.status(404).json({ error: 'Recorrência não encontrada' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
