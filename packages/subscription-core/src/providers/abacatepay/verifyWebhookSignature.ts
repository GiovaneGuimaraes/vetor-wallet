import { createHmac } from 'crypto';
import { safeEqual } from '../../safeEqual';
import { ABACATEPAY_WEBHOOK_PUBLIC_KEY } from './webhookPublicKey';

/** Qual esquema de assinatura casou com o header `X-Webhook-Signature`. */
export type WebhookSignatureScheme = 'abacatepay-public-key' | 'legacy-secret';

export interface VerifyWebhookSignatureInput {
  /** Os BYTES recebidos, exatamente como chegaram (nunca um JSON reserializado). */
  rawBody: Buffer;
  /** Valor cru do header `X-Webhook-Signature` (`''` quando ausente). */
  signature: string;
  /** Nosso `ABACATEPAY_WEBHOOK_SECRET` — chave do esquema legado. */
  legacySecret: string;
}

const LEGACY_PREFIX = 'sha256=';

/**
 * Verifica a assinatura do webhook da AbacatePay (T-123) e devolve o esquema
 * que casou, ou `null` se nenhum casou.
 *
 * 1. **`abacatepay-public-key`** — o esquema da doc oficial: HMAC-SHA256 do
 *    corpo cru com a chave PÚBLICA fixa da AbacatePay, em base64.
 * 2. **`legacy-secret`** — o esquema que o app usava até a T-123: HMAC-SHA256
 *    do corpo cru com o NOSSO segredo, em hex, aceitando o prefixo `sha256=`.
 *    Fica como fallback porque nunca recebemos uma entrega real que prove qual
 *    dos dois a AbacatePay usa de fato.
 *
 * Toda comparação é em tempo constante via `safeEqual`, que não lança com
 * tamanhos diferentes. Assinatura vazia nunca casa; segredo legado vazio
 * desliga o esquema legado (HMAC com chave vazia qualquer um calcula).
 *
 * A chave pública prova só integridade do corpo, não origem: quem chama esta
 * função ainda precisa conferir o `?webhookSecret=` da URL.
 */
export const verifyWebhookSignature = ({
  rawBody,
  signature,
  legacySecret,
}: VerifyWebhookSignatureInput): WebhookSignatureScheme | null => {
  if (!signature) return null;

  const publicKeySignature = createHmac('sha256', ABACATEPAY_WEBHOOK_PUBLIC_KEY)
    .update(rawBody)
    .digest('base64');
  if (safeEqual(signature, publicKeySignature)) return 'abacatepay-public-key';

  if (!legacySecret) return null;
  const legacySignature = createHmac('sha256', legacySecret).update(rawBody).digest('hex');
  const provided = signature.startsWith(LEGACY_PREFIX)
    ? signature.slice(LEGACY_PREFIX.length)
    : signature;
  if (safeEqual(provided, legacySignature)) return 'legacy-secret';

  return null;
};
