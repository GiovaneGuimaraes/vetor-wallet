import { type PixChargeRow, toPixCharge } from 'src/PixCharge';

const row: PixChargeRow = {
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

describe('toPixCharge', () => {
  test('projeta a linha na forma da API', () => {
    expect(toPixCharge(row)).toEqual({
      id: 10,
      plan_id: 1,
      amount_cents: 2990,
      status: 'PENDING',
      br_code: '00020126...',
      br_code_base64: 'data:image/png;base64,AAA',
      expires_at: '2026-08-01 13:00:00',
      created_at: '2026-08-01 12:00:00',
    });
  });

  test('NÃO vaza user_id nem abacate_charge_id', () => {
    // `user_id` é redundante (a rota já é do usuário logado) e
    // `abacate_charge_id` é identificador do provedor — só o webhook precisa.
    const projected = toPixCharge(row);
    expect(projected).not.toHaveProperty('user_id');
    expect(projected).not.toHaveProperty('abacate_charge_id');
    expect(projected).not.toHaveProperty('paid_at');
  });

  test('expires_at ausente vira null ("sem expiração conhecida")', () => {
    const semPrazo = { ...row, expires_at: undefined } as unknown as PixChargeRow;
    expect(toPixCharge(semPrazo).expires_at).toBeNull();
  });

  test('normaliza os tipos que o driver devolve como string', () => {
    const driverRow = {
      ...row,
      id: '10',
      plan_id: '1',
      amount_cents: '2990',
    } as unknown as PixChargeRow;

    expect(toPixCharge(driverRow)).toMatchObject({ id: 10, plan_id: 1, amount_cents: 2990 });
  });
});
