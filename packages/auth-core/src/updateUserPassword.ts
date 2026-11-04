import type { Query } from '@vetor-wallet/query';
import { hashPassword } from './hashPassword';

export interface UpdateUserPasswordParams {
  query: Query;
  userId: number;
  newPassword: string;
}

/**
 * Hash + `UPDATE` direto (T-094). Quem chama já validou a senha atual e a nova.
 * Nenhuma rota chama mais desde a T-106 (troca de senha virou `ChangePassword`
 * no Cognito).
 */
export async function updateUserPassword(params: UpdateUserPasswordParams): Promise<void> {
  const { query, userId, newPassword } = params;
  const passwordHash = await hashPassword(newPassword);
  await query({
    text: 'UPDATE users SET password_hash = $1 WHERE id = $2',
    values: [passwordHash, userId],
  });
}
