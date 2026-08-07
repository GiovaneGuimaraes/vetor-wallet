import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { AbacatePayError, checkPixCharge } from '@vetor-wallet/abacatepay-core';
import {
  markChargePaidAndActivate,
  nowSqliteUtc,
  toPixCharge,
  type PixChargeRow,
} from '@vetor-wallet/billing-core';

const router = Router();

router.use(requireAuth);

async function loadCharge(id: string, userId: number): Promise<PixChargeRow | null> {
  const res = await db.execute({
    sql: 'SELECT * FROM pix_charges WHERE id = ? AND user_id = ?',
    args: [id, userId],
  });
  return (res.rows[0] as unknown as PixChargeRow) ?? null;
}

/**
 * Polling do status de uma cobrança. O `:id` é o id LOCAL (`pix_charges.id`),
 * não o do provedor: é o que o front recebe e o que permite o filtro por
 * `user_id`.
 *
 * O webhook é o caminho principal de ativação; este GET existe porque o webhook
 * pode atrasar (ou não chegar em dev) e a tela precisa reagir ao pagamento.
 * Ambos chamam `markChargePaidAndActivate`, então ativar por aqui não soma
 * período duas vezes.
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const row = await loadCharge(req.params.id, userId);
    if (!row) {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }

    // Já paga localmente: estado final, nada a consultar. Evita um fetch por
    // polling numa tela que talvez continue aberta depois do pagamento.
    if (row.status === 'PAID') {
      res.json(toPixCharge(row));
      return;
    }

    let remote;
    try {
      remote = await checkPixCharge(String(row.abacate_charge_id));
    } catch (err) {
      if (err instanceof AbacatePayError) {
        // Mesmo espírito do `quotesUnavailable` do portfolio: um blip do
        // provedor não pode transformar o polling em erro na tela. Devolve o
        // estado local com a ressalva de que ele pode estar defasado.
        res.json({ ...toPixCharge(row), providerUnavailable: true });
        return;
      }
      throw err;
    }

    if (remote.status === 'PAID') {
      await markChargePaidAndActivate(String(row.abacate_charge_id));
    } else if (remote.status !== 'PENDING') {
      // EXPIRED / CANCELLED / REFUNDED: estado final do provedor, persistido
      // para o polling parar de consultar.
      await db.execute({
        sql: `UPDATE pix_charges SET status = ? WHERE id = ? AND status <> ?`,
        args: [remote.status, row.id, remote.status],
      });
    } else if (row.expires_at != null && row.expires_at < nowSqliteUtc()) {
      // Provedor ainda diz PENDING, mas o prazo que registramos passou: marca
      // EXPIRED do nosso lado para o front oferecer uma cobrança nova. Se um
      // pagamento tardio chegar depois, o webhook ainda ativa (ver
      // `markChargePaidAndActivate`).
      await db.execute({
        sql: `UPDATE pix_charges SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'`,
        args: [row.id],
      });
    }

    const fresh = await loadCharge(req.params.id, userId);
    res.json(toPixCharge(fresh ?? row));
  }),
);

export default router;
