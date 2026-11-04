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
 * Não cria a carteira padrão (T-121): quem orquestra é a rota, não este core.
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

  return {
    id,
    email: normalizedEmail,
    name: null,
    phone: null,
    created_at: new Date().toISOString(),
    roles: [],
  };
}
