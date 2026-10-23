import { getPendingCharge } from 'src/getPendingCharge';
import { createTestQuery } from 'tests/unit/testQuery';

const NOW = '2026-08-01 12:00:00';

const chargeRow = {
  id: 10,
  user_id: 42,
  plan_id: 1,
  abacate_charge_id: 'pix_char_abc',
  amount_cents: 2990,
  status: 'PENDING',
  br_code: '00020126...',
  br_code_base64: 'data:image/png;base64,AAA',
  expires_at: '2026-08-01 13:00:00',
  paid_at: null,
  created_at: '2026-08-01 12:00:00',
};

describe('getPendingCharge', () => {
  let query: ReturnType<typeof createTestQuery>;

  beforeEach(() => {
    query = createTestQuery();
  });

  test('sem planId: filtra por usuário, PENDING e prazo, sem cláusula de plano', async () => {
    query.mockResolvedValue({ rows: [chargeRow], rowCount: 1 });

    const result = await getPendingCharge({ query, userId: 42, nowIso: NOW });

    const { text, values } = query.mock.calls[0][0];
    expect(text).not.toContain('plan_id = $3');
    expect(values).toEqual([42, NOW]);
    expect(text).toMatchSnapshot();
    expect(result).toEqual(chargeRow);
  });

  test('com planId: acrescenta a cláusula de plano e o arg na ordem certa', async () => {
    // A assinatura só reaproveita cobrança do MESMO plano — dois QR Codes
    // válidos ao mesmo tempo é convite a pagar duas vezes.
    query.mockResolvedValue({ rows: [chargeRow], rowCount: 1 });

    await getPendingCharge({ query, userId: 42, nowIso: NOW, planId: 7 });

    const { text, values } = query.mock.calls[0][0];
    expect(text).toContain('plan_id = $3');
    expect(values).toEqual([42, NOW, 7]);
    expect(text).toMatchSnapshot();
  });

  test('planId 0 é tratado como filtro, não como ausência', async () => {
    // Guarda contra `if (planId)` no lugar de `planId !== undefined`.
    await getPendingCharge({ query, userId: 42, nowIso: NOW, planId: 0 });

    expect(query.mock.calls[0][0].values).toEqual([42, NOW, 0]);
  });

  test('inclui cobrança sem expires_at conhecido', async () => {
    // O provedor é a fonte da verdade sobre o prazo; descartar uma cobrança que
    // talvez esteja válida faria o usuário pagar duas vezes.
    await getPendingCharge({ query, userId: 42, nowIso: NOW });

    expect(query.mock.calls[0][0].text).toContain('expires_at IS NULL');
  });

  test('pega a mais recente (ordem por created_at e id, LIMIT 1)', async () => {
    await getPendingCharge({ query, userId: 42, nowIso: NOW });

    const { text } = query.mock.calls[0][0];
    expect(text).toContain('ORDER BY created_at DESC, id DESC');
    expect(text).toContain('LIMIT 1');
  });

  test('nenhuma cobrança pendente vira null', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(getPendingCharge({ query, userId: 42, nowIso: NOW })).resolves.toBeNull();
  });
});
