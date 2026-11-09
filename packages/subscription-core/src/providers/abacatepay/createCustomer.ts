import { AbacatePayError } from './AbacatePayError';
import { abacatePayRequest } from './request';

export interface CreateCustomerInput {
  email: string;
  /** Opcional; ausente é OMITIDO do JSON. */
  name?: string;
}

/**
 * Cria o cliente na AbacatePay. Só e-mail e nome — sem CPF nem celular
 * (decisão do humano, T-124): o cliente nasce na assinatura, não no cadastro.
 */
export const createCustomer = async (input: CreateCustomerInput): Promise<{ id: string }> => {
  const path = '/customers/create';
  const raw = await abacatePayRequest<{ id?: unknown }>(path, {
    method: 'POST',
    body: { email: input.email, name: input.name },
  });

  // Sem id não há o que gravar em `billing_customers`: é falha, não sucesso vazio.
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new AbacatePayError(`AbacatePay não devolveu o id do cliente em ${path}`, 200, raw);
  }

  return { id: raw.id };
};
