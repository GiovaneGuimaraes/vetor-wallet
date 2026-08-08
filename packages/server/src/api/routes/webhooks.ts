import { Router, Request, Response } from 'express';
import express from 'express';
import { createHmac } from 'crypto';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { markChargePaidAndActivate, safeEqual } from '@vetor-wallet/subscription-core';

const router = Router();

/** Eventos que confirmam pagamento; qualquer outro é ignorado com 2xx. */
const PAID_EVENTS = new Set(['transparent.completed', 'checkout.completed']);

interface WebhookPayload {
  id?: string;
  event?: string;
  devMode?: boolean;
  data?: {
    id?: string;
    pixQrCode?: { id?: string };
    charge?: { id?: string };
  };
}

/**
 * Webhook da AbacatePay (T-070). **Sem sessão e sem `requireAuth`** — quem
 * chama é o provedor, não um browser logado. A autenticação é dupla: o
 * `?webhookSecret=` da querystring (padrão da AbacatePay) E o HMAC-SHA256 do
 * corpo. Uma só das duas não bastaria: o segredo na URL vaza em log de proxy, e
 * a assinatura sem segredo não amarra a chamada à nossa integração.
 *
 * `express.raw` é obrigatório: o HMAC é sobre os BYTES recebidos. Reserializar
 * (`JSON.stringify(req.body)`) reordena/reformata e a assinatura deixa de bater.
 *
 * ATENÇÃO — este router precisa ser montado ANTES de `app.use(express.json())`
 * em `api/index.ts`. Se o json global rodar primeiro, ele consome o stream e
 * marca `req._body`, o `express.raw` daqui é PULADO, `req.body` chega como
 * objeto já parseado e a verificação de HMAC quebra silenciosamente (assinatura
 * sempre inválida → 401 em todo evento legítimo). A linha NÃO pode descer.
 */
async function handler(req: Request, res: Response): Promise<void> {
  const secret = (process.env.ABACATEPAY_WEBHOOK_SECRET ?? '').trim();

  // Fail-closed: sem segredo configurado NENHUM webhook é aceito. O contrário
  // (aceitar tudo quando o env falta) transformaria um deploy mal configurado
  // em endpoint público de ativação de assinatura.
  if (!secret) {
    res.status(401).json({ error: 'Webhook não configurado' });
    return;
  }

  const querySecret = typeof req.query.webhookSecret === 'string' ? req.query.webhookSecret : '';
  if (!safeEqual(querySecret, secret)) {
    res.status(401).json({ error: 'Segredo inválido' });
    return;
  }

  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const headerSignature = req.get('x-webhook-signature') ?? '';
  // Header AUSENTE também é 401: a validação dupla é obrigatória, e tratar a
  // falta de assinatura como "ok, o segredo da URL basta" desfaria a segunda
  // camada justamente para quem não a implementa (um atacante com o segredo
  // vazado em log).
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = headerSignature.startsWith('sha256=')
    ? headerSignature.slice('sha256='.length)
    : headerSignature;
  if (!safeEqual(provided, expected)) {
    res.status(401).json({ error: 'Assinatura inválida' });
    return;
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as WebhookPayload;
  } catch {
    res.status(400).json({ error: 'Corpo não é JSON válido' });
    return;
  }

  const event = typeof payload.event === 'string' ? payload.event : '';
  // Leitura defensiva: o id da cobrança já apareceu em três lugares diferentes
  // nos payloads do provedor dependendo do fluxo.
  const chargeId =
    payload.data?.id ?? payload.data?.pixQrCode?.id ?? payload.data?.charge?.id ?? '';

  if (!PAID_EVENTS.has(event)) {
    // 2xx OBRIGATÓRIO em evento que não tratamos: responder 4xx/5xx faz o
    // provedor reentregar para sempre um evento que nunca vamos processar.
    res.json({ ok: true, ignored: true });
    return;
  }

  // Idempotência: o UNIQUE de `event_id` é a trava. Reentrega do mesmo evento
  // não chega a chamar a ativação. O fallback de id cobre payloads sem `id`.
  const eventId = typeof payload.id === 'string' && payload.id ? payload.id : `${event}:${chargeId}`;
  const inserted = await db.execute({
    sql: `INSERT OR IGNORE INTO billing_webhook_events (event_id, event_type, charge_id)
          VALUES (?, ?, ?)`,
    args: [eventId, event, chargeId],
  });
  if (inserted.rowsAffected === 0) {
    res.json({ ok: true, duplicate: true });
    return;
  }

  if (payload.devMode) {
    console.log(`[webhook] evento devMode do provedor (${event}, charge ${chargeId})`);
  }

  if (!chargeId) {
    res.json({ ok: true, unknownCharge: true });
    return;
  }

  // O dono da assinatura vem de `pix_charges.user_id`, NUNCA de
  // `payload.data.metadata.userId`: metadata é dado de fora e ativaria a
  // assinatura de outra pessoa se forjado.
  //
  // Erro de banco aqui NÃO é capturado de propósito: o asyncHandler leva ao
  // errorHandler (500) e a reentrega do provedor é justamente o que queremos —
  // a linha de idempotência e a ativação estão em statements distintos, mas a
  // ativação é idempotente por si.
  const { activated, userId } = await markChargePaidAndActivate({ db, abacateChargeId: chargeId });
  if (userId == null) {
    res.json({ ok: true, unknownCharge: true });
    return;
  }
  res.json({ ok: true, activated });
}

router.post('/abacatepay', express.raw({ type: '*/*', limit: '64kb' }), asyncHandler(handler));

export default router;
