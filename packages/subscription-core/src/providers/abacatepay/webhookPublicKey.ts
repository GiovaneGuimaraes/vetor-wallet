/**
 * Chave PÚBLICA fixa com que a AbacatePay assina o corpo de todo webhook
 * (HMAC-SHA256, saída em base64, header `X-Webhook-Signature`) — T-123.
 *
 * Copiada literalmente de https://docs.abacatepay.com/pages/webhooks/security
 * (lida em 2026-11-08; a mesma string aparece nos exemplos Node, Python e Go da
 * página). NÃO é segredo: está publicada e é a mesma para todo cliente da
 * AbacatePay. Por isso a assinatura com ela prova só INTEGRIDADE do corpo,
 * nunca ORIGEM — qualquer um que leia a doc assina um corpo forjado. A prova de
 * origem continua sendo o `?webhookSecret=` da URL, comparado ao nosso
 * `ABACATEPAY_WEBHOOK_SECRET`.
 */
export const ABACATEPAY_WEBHOOK_PUBLIC_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';
