import {
  type AbacatePixCharge,
  type RawAbacateCharge,
  toAbacatePixCharge,
} from './AbacatePixCharge';
import { abacatePayRequest } from './request';

/**
 * Simula o pagamento de uma cobrança (só funciona em cobranças `devMode` do
 * provedor). **Não** checa `NODE_ENV` de propósito: a guarda de ambiente
 * pertence à rota que expõe isso (T-070), mantendo este módulo como client HTTP
 * puro e testável sem mexer em env de ambiente.
 */
export const simulatePixPayment = async (chargeId: string): Promise<AbacatePixCharge> => {
  const raw = await abacatePayRequest<RawAbacateCharge>(
    `/transparents/simulate-payment?id=${encodeURIComponent(chargeId)}`,
    { method: 'POST', body: {} },
  );

  return toAbacatePixCharge(raw);
};
