import type { Query } from '@vetor-wallet/query';
import type { User } from '@vetor-wallet/shared';
import { SELECT_COGNITO_USER } from './SELECT_COGNITO_USER';
import { toUser, type UserRow } from './toUser';

export interface FindUserByCognitoSubParams {
  query: Query;
  cognitoSub: string;
}

/** Acha o espelho pelo `sub` do pool. É a leitura do caminho feliz do login. */
export async function findUserByCognitoSub(
  params: FindUserByCognitoSubParams
): Promise<User | null> {
  const { query, cognitoSub } = params;
  const result = await query<UserRow>({
    text: `${SELECT_COGNITO_USER}cognito_sub = $1`,
    values: [cognitoSub.trim()],
  });
  if (result.rows.length === 0) return null;
  return toUser(result.rows[0]);
}
