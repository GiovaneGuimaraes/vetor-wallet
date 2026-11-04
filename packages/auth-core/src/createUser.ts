import { getOrCreateDefaultWallet } from '@vetor-wallet/portfolio-core';
import type { Query } from '@vetor-wallet/query';
import type { User } from '@vetor-wallet/shared';
import { hashPassword } from './hashPassword';

export interface CreateUserParams {
  query: Query;
  email: string;
  password: string;
}

/**
 * Conta "pré-Cognito" (legado e testes) — registro novo passa pelo Cognito e o
 * espelho nasce em `findOrCreateUserByCognitoSub`.
 *
 * Cria a carteira padrão (T-050): falhar ali NÃO derruba o registro — o
 * lazy-create do `GET /api/wallets` segue como rede de segurança (T-050a).
 */
export async function createUser(params: CreateUserParams): Promise<User> {
  const { query, email, password } = params;
  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);
  const insert = await query<{ id: number }>({
    text: 'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
    values: [normalizedEmail, passwordHash],
  });
  const id = Number(insert.rows[0]?.id ?? 0);

  try {
    await getOrCreateDefaultWallet({ query, userId: id });
  } catch (err) {
    console.error('Falha ao criar a carteira padrao do usuario', id, err);
  }

  return {
    id,
    email: normalizedEmail,
    name: null,
    phone: null,
    created_at: new Date().toISOString(),
    roles: [],
  };
}
