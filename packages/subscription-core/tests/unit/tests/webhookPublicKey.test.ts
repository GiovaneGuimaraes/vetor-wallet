import { createHmac } from 'crypto';
import { ABACATEPAY_WEBHOOK_PUBLIC_KEY } from 'src/providers/abacatepay/webhookPublicKey';

describe('ABACATEPAY_WEBHOOK_PUBLIC_KEY', () => {
  test('tem a forma da chave publicada na doc (prefixo e tamanho)', () => {
    expect(ABACATEPAY_WEBHOOK_PUBLIC_KEY.startsWith('t9dXRhHHo3yD')).toBe(true);
    expect(ABACATEPAY_WEBHOOK_PUBLIC_KEY).toHaveLength(256);
    expect(ABACATEPAY_WEBHOOK_PUBLIC_KEY).toMatch(/^[A-Za-z0-9]+$/);
  });

  test('reproduz um vetor conhecido calculado com a chave copiada da doc', () => {
    // Vetor gerado em 2026-11-08 a partir da string da página
    // docs.abacatepay.com/pages/webhooks/security, independente desta constante:
    // um caractere trocado na chave muda a saída inteira.
    const body = '{"id":"evt_kat","event":"transparent.completed","data":{"id":"pix_char_kat"}}';
    const digest = createHmac('sha256', ABACATEPAY_WEBHOOK_PUBLIC_KEY)
      .update(Buffer.from(body, 'utf8'))
      .digest('base64');
    expect(digest).toBe('XHm7Gpyv3o1cZ++AuTdiIv6lVbewxMLXB6ndBsuyI54=');
  });
});
