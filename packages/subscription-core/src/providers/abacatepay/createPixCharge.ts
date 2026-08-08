import {
  type AbacatePixCharge,
  type RawAbacateCharge,
  toAbacatePixCharge,
} from './AbacatePixCharge';
import { abacatePayRequest } from './request';

/** Expiração default da cobrança Pix: 1 hora. */
export const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export interface CreatePixChargeInput {
  /** Valor em CENTAVOS. */
  amountCents: number;
  description: string;
  /** Default 3600 (1h). */
  expiresInSeconds?: number;
  /** Nossa referência da cobrança (usada para reconciliar no webhook). */
  externalId: string;
  metadata?: Record<string, unknown>;
  customer?: Record<string, unknown>;
}

/** Cria uma cobrança Pix (QR Code + copia-e-cola). */
export const createPixCharge = async (
  input: CreatePixChargeInput,
): Promise<AbacatePixCharge> => {
  // Campos opcionais ausentes são OMITIDOS do JSON (undefined não serializa),
  // em vez de enviados como null — a API rejeita null onde espera objeto.
  const raw = await abacatePayRequest<RawAbacateCharge>('/transparents/create', {
    method: 'POST',
    body: {
      method: 'PIX',
      data: {
        amount: input.amountCents,
        description: input.description,
        expiresIn: input.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS,
        externalId: input.externalId,
        metadata: input.metadata,
        customer: input.customer,
      },
    },
  });

  return toAbacatePixCharge(raw);
};
