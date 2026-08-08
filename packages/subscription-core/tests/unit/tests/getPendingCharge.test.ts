import { getPendingCharge } from 'src/getPendingCharge';
import { createMockDb, type MockDb } from 'tests/unit/createMockDb';

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
  let db: MockDb;

  beforeEach(() => {
    db = createMockDb();
  });

  test('sem planId: filtra por usuário, PENDING e prazo, sem cláusula de plano', async () => {
    db.execute.mockResolvedValue({ rows: [chargeRow] });

    const result = await getPendingCharge({ db, userId: 42, nowIso: NOW });

    const { sql, args } = db.execute.mock.calls[0][0];
    expect(sql).not.toContain('plan_id = ?');
    expect(args).toEqual([42, NOW]);
    expect(sql).toMatchSnapshot();
    expect(result).toEqual(chargeRow);
  });

  test('com planId: acrescenta a cláusula de plano e o arg na ordem certa', async () => {
    // A assinatura só reaproveita cobrança do MESMO plano — dois QR Codes
    // válidos ao mesmo tempo é convite a pagar duas vezes.
    db.execute.mockResolvedValue({ rows: [chargeRow] });

    await getPendingCharge({ db, userId: 42, nowIso: NOW, planId: 7 });

    const { sql, args } = db.execute.mock.calls[0][0];
    expect(sql).toContain('plan_id = ?');
    expect(args).toEqual([42, NOW, 7]);
    expect(sql).toMatchSnapshot();
  });

  test('planId 0 é tratado como filtro, não como ausência', async () => {
    // Guarda contra `if (planId)` no lugar de `planId !== undefined`.
    await getPendingCharge({ db, userId: 42, nowIso: NOW, planId: 0 });

    expect(db.execute.mock.calls[0][0].args).toEqual([42, NOW, 0]);
  });

  test('inclui cobrança sem expires_at conhecido', async () => {
    // O provedor é a fonte da verdade sobre o prazo; descartar uma cobrança que
    // talvez esteja válida faria o usuário pagar duas vezes.
    await getPendingCharge({ db, userId: 42, nowIso: NOW });

    expect(db.execute.mock.calls[0][0].sql).toContain('expires_at IS NULL');
  });

  test('pega a mais recente (ordem por created_at e id, LIMIT 1)', async () => {
    await getPendingCharge({ db, userId: 42, nowIso: NOW });

    const { sql } = db.execute.mock.calls[0][0];
    expect(sql).toContain('ORDER BY created_at DESC, id DESC');
    expect(sql).toContain('LIMIT 1');
  });

  test('nenhuma cobrança pendente vira null', async () => {
    db.execute.mockResolvedValue({ rows: [] });

    await expect(getPendingCharge({ db, userId: 42, nowIso: NOW })).resolves.toBeNull();
  });
});
