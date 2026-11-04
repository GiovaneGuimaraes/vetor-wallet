import type { Query } from '@vetor-wallet/query';
import type { User } from '@vetor-wallet/shared';
import { toUser, type UserRow } from './toUser';

export interface FindUserByEmailParams {
  query: Query;
  email: string;
}

/** Devolve o `password_hash` — nunca devolva este objeto direto numa resposta HTTP. */
export async function findUserByEmail(
  params: FindUserByEmailParams
): Promise<(User & { password_hash: string }) | null> {
  const { query, email } = params;
  const result = await query<UserRow & { password_hash: string }>({
    text: 'SELECT id, email, name, phone, password_hash, created_at, roles FROM users WHERE email = $1',
    values: [email.toLowerCase().trim()],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { ...toUser(row), password_hash: row.password_hash };
}
