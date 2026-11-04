import { getOrCreateDefaultWallet } from '@vetor-wallet/portfolio-core';
import type { Query } from '@vetor-wallet/query';
import type { User } from '@vetor-wallet/shared';
import { COGNITO_MANAGED_PASSWORD_HASH } from './COGNITO_MANAGED_PASSWORD_HASH';
import { SELECT_COGNITO_USER } from './SELECT_COGNITO_USER';
import { toUser, type UserRow } from './toUser';

export interface CreateCognitoUserParams {
  query: Query;
  email: string;
  cognitoSub: string;
}

/**
 * Cria o espelho de um usuário que só existe no Cognito.
 *
 * E-mail normalizado (invariante do package) e `password_hash` sentinela. Cria a
 * carteira padrão como o `createUser` faz, e **falhar ali não derruba o login**
 * (T-050a): o lazy-create do `GET /api/wallets` segue como rede de segurança.
 */
export async function createCognitoUser(params: CreateCognitoUserParams): Promise<User> {
  const { query, email, cognitoSub } = params;
  const normalizedEmail = email.toLowerCase().trim();
  const insert = await query<{ id: number }>({
    text: 'INSERT INTO users (email, password_hash, cognito_sub) VALUES ($1, $2, $3) RETURNING id',
    values: [normalizedEmail, COGNITO_MANAGED_PASSWORD_HASH, cognitoSub.trim()],
  });
  const id = Number(insert.rows[0]?.id ?? 0);

  try {
    await getOrCreateDefaultWallet({ query, userId: id });
  } catch (err) {
    console.error('Falha ao criar a carteira padrao do usuario', id, err);
  }

  const result = await query<UserRow>({
    text: `${SELECT_COGNITO_USER}id = $1`,
    values: [id],
  });
  return toUser(result.rows[0]);
}
