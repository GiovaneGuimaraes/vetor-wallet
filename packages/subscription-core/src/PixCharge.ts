import type { PixCharge } from '@vetor-wallet/shared';

/** Linha crua de `pix_charges`, como sai do SQLite. */
export interface PixChargeRow {
  id: number;
  user_id: number;
  plan_id: number;
  abacate_charge_id: string;
  amount_cents: number;
  status: PixCharge['status'];
  br_code: string;
  br_code_base64: string;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
}

/**
 * Projeta a linha de cobrança na forma exposta pela API. O `user_id` e o
 * `abacate_charge_id` ficam de fora de propósito: o primeiro é redundante (a
 * rota já é do usuário logado) e o segundo é identificador do provedor, que só
 * o webhook precisa conhecer.
 */
export const toPixCharge = (row: PixChargeRow): PixCharge => {
  return {
    id: Number(row.id),
    plan_id: Number(row.plan_id),
    amount_cents: Number(row.amount_cents),
    status: row.status,
    br_code: String(row.br_code),
    br_code_base64: String(row.br_code_base64),
    expires_at: row.expires_at ?? null,
    created_at: String(row.created_at),
  };
};
