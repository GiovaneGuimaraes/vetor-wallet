import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { AbacatePayError, simulatePixPayment } from '../services/abacatepay';
import { markChargePaidAndActivate, toPixCharge, type PixChargeRow } from '../services/billing';

const router = Router();

router.use(requireAuth);

/**
 * Simula o pagamento de uma cobrança `devMode` — atalho de desenvolvimento para
 * testar a ativação sem Pix real.
 *
 * Em produção a rota **não existe** (404, não 403): 403 confirmaria que existe
 * um endpoint capaz de ativar assinatura sem pagamento, e essa informação não
 * tem por que sair daqui. A guarda é a primeira linha do handler, antes de
 * qualquer leitura do banco.
 */
router.post(
  '/simulate/:chargeId',
  asyncHandler(async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }

    const userId = res.locals.userId as number;
    const chargeRes = await db.execute({
      sql: 'SELECT * FROM pix_charges WHERE id = ? AND user_id = ?',
      args: [req.params.chargeId, userId],
    });
    const row = (chargeRes.rows[0] as unknown as PixChargeRow) ?? null;
    if (!row) {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }
    if (row.status !== 'PENDING') {
      res.status(409).json({ error: `Cobrança não está pendente (${row.status})` });
      return;
    }

    let remote;
    try {
      remote = await simulatePixPayment(String(row.abacate_charge_id));
    } catch (err) {
      if (err instanceof AbacatePayError) {
        res
          .status(502)
          .json({ code: 'PAYMENT_PROVIDER_ERROR', error: 'Provedor de pagamento indisponível' });
        return;
      }
      throw err;
    }

    if (remote.status === 'PAID') {
      await markChargePaidAndActivate(String(row.abacate_charge_id));
    }

    const fresh = await db.execute({
      sql: 'SELECT * FROM pix_charges WHERE id = ? AND user_id = ?',
      args: [req.params.chargeId, userId],
    });
    res.json(toPixCharge((fresh.rows[0] as unknown as PixChargeRow) ?? row));
  }),
);

export default router;
