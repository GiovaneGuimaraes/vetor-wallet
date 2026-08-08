export type AbacatePixChargeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED';

/** Cobrança Pix normalizada — a forma que o resto do app consome. */
export interface AbacatePixCharge {
  /** Id da cobrança no provedor (gravado em `pix_charges.abacate_charge_id`). */
  id: string;
  /** Valor em CENTAVOS, como o provedor transaciona. */
  amount: number;
  status: AbacatePixChargeStatus;
  /** Payload Pix copia-e-cola. */
  brCode: string;
  /** Mesmo payload como imagem QR em base64 (data URI). */
  brCodeBase64: string;
  /** ISO 8601 ou null quando o provedor não informa expiração. */
  expiresAt: string | null;
  /** true quando a cobrança foi criada em ambiente de testes do provedor. */
  devMode?: boolean;
}

/** Cobrança como o provedor devolve, antes da normalização. */
export interface RawAbacateCharge {
  id: string;
  amount: number;
  status: AbacatePixChargeStatus;
  brCode: string;
  brCodeBase64: string;
  expiresAt?: string | null;
  devMode?: boolean;
}

/**
 * Normaliza a cobrança do provedor. `expiresAt` ausente vira `null` explícito
 * ("sem expiração conhecida") — quem grava depende dessa distinção contra
 * `undefined`, que sumiria do JSON.
 */
export const toAbacatePixCharge = (raw: RawAbacateCharge): AbacatePixCharge => {
  return {
    id: raw.id,
    amount: raw.amount,
    status: raw.status,
    brCode: raw.brCode,
    brCodeBase64: raw.brCodeBase64,
    expiresAt: raw.expiresAt ?? null,
    devMode: raw.devMode,
  };
};
