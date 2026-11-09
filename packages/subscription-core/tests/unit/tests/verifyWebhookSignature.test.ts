import { createHmac } from 'crypto';
import { verifyWebhookSignature } from 'src/providers/abacatepay/verifyWebhookSignature';
import { ABACATEPAY_WEBHOOK_PUBLIC_KEY } from 'src/providers/abacatepay/webhookPublicKey';

const SECRET = 'segredo-de-teste';
const BODY = Buffer.from(
  '{"id":"evt_kat","event":"transparent.completed","data":{"id":"pix_char_kat"}}',
  'utf8'
);
// Vetor conhecido (ver webhookPublicKey.test.ts): assinatura da doc para BODY.
const DOC_SIGNATURE = 'XHm7Gpyv3o1cZ++AuTdiIv6lVbewxMLXB6ndBsuyI54=';

const legacy = (body: Buffer, secret = SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');
const publicKey = (body: Buffer) =>
  createHmac('sha256', ABACATEPAY_WEBHOOK_PUBLIC_KEY).update(body).digest('base64');

describe('verifyWebhookSignature', () => {
  test('aceita o esquema da doc (chave pública fixa, base64)', () => {
    expect(
      verifyWebhookSignature({ rawBody: BODY, signature: DOC_SIGNATURE, legacySecret: SECRET })
    ).toBe('abacatepay-public-key');
  });

  test('o esquema da doc não depende do nosso segredo', () => {
    expect(
      verifyWebhookSignature({ rawBody: BODY, signature: DOC_SIGNATURE, legacySecret: '' })
    ).toBe('abacatepay-public-key');
  });

  test('aceita o esquema legado (nosso segredo, hex)', () => {
    expect(
      verifyWebhookSignature({ rawBody: BODY, signature: legacy(BODY), legacySecret: SECRET })
    ).toBe('legacy-secret');
  });

  test('aceita o esquema legado com prefixo sha256=', () => {
    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signature: `sha256=${legacy(BODY)}`,
        legacySecret: SECRET,
      })
    ).toBe('legacy-secret');
  });

  test('assinatura vazia (header ausente) não casa', () => {
    expect(verifyWebhookSignature({ rawBody: BODY, signature: '', legacySecret: SECRET })).toBe(
      null
    );
  });

  test('assinatura inválida nos dois esquemas não casa', () => {
    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signature: legacy(BODY, 'outro-segredo'),
        legacySecret: SECRET,
      })
    ).toBe(null);
  });

  test('corpo adulterado com a assinatura de outro corpo é recusado (doc)', () => {
    const tampered = Buffer.from(BODY.toString('utf8').replace('pix_char_kat', 'pix_char_xxx'));
    expect(
      verifyWebhookSignature({ rawBody: tampered, signature: DOC_SIGNATURE, legacySecret: SECRET })
    ).toBe(null);
  });

  test('corpo adulterado com a assinatura de outro corpo é recusado (legado)', () => {
    const tampered = Buffer.from(BODY.toString('utf8').replace('pix_char_kat', 'pix_char_xxx'));
    expect(
      verifyWebhookSignature({ rawBody: tampered, signature: legacy(BODY), legacySecret: SECRET })
    ).toBe(null);
  });

  test('não cruza os esquemas: hex com a chave pública e base64 com o segredo não casam', () => {
    const publicHex = createHmac('sha256', ABACATEPAY_WEBHOOK_PUBLIC_KEY)
      .update(BODY)
      .digest('hex');
    const legacyBase64 = createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(
      verifyWebhookSignature({ rawBody: BODY, signature: publicHex, legacySecret: SECRET })
    ).toBe(null);
    expect(
      verifyWebhookSignature({ rawBody: BODY, signature: legacyBase64, legacySecret: SECRET })
    ).toBe(null);
  });

  test('o esquema da doc não aceita prefixo sha256=', () => {
    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signature: `sha256=${publicKey(BODY)}`,
        legacySecret: SECRET,
      })
    ).toBe(null);
  });

  test('segredo legado vazio desliga o legado (HMAC de chave vazia qualquer um calcula)', () => {
    expect(
      verifyWebhookSignature({ rawBody: BODY, signature: legacy(BODY, ''), legacySecret: '' })
    ).toBe(null);
  });

  test('não lança com tamanhos diferentes (comparação em tempo constante)', () => {
    for (const signature of ['x', 'a'.repeat(1000), `sha256=`, 'ção']) {
      expect(() =>
        verifyWebhookSignature({ rawBody: BODY, signature, legacySecret: SECRET })
      ).not.toThrow();
      expect(verifyWebhookSignature({ rawBody: BODY, signature, legacySecret: SECRET })).toBe(
        null
      );
    }
  });

  test('corpo vazio também é verificado (sem atalho)', () => {
    const empty = Buffer.from('');
    expect(
      verifyWebhookSignature({ rawBody: empty, signature: publicKey(empty), legacySecret: SECRET })
    ).toBe('abacatepay-public-key');
  });
});
