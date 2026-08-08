import {
  type AbacatePixCharge,
  type RawAbacateCharge,
  toAbacatePixCharge,
} from './AbacatePixCharge';
import { abacatePayRequest } from './request';

/** Consulta o status atual de uma cobrança pelo id do provedor. */
export const checkPixCharge = async (chargeId: string): Promise<AbacatePixCharge> => {
  const raw = await abacatePayRequest<RawAbacateCharge>(
    `/transparents/check?id=${encodeURIComponent(chargeId)}`,
    { method: 'GET' },
  );

  return toAbacatePixCharge(raw);
};
