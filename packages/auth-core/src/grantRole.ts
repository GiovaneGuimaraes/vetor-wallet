import type { Query } from '@vetor-wallet/query';
import { findUserByEmail } from './findUserByEmail';
import { serializeRoles } from './serializeRoles';

export interface GrantRoleParams {
  query: Query;
  email: string;
  role: string;
}

/** Idempotente: papel já presente responde `{ granted: false }` sem escrever. */
export async function grantRole(params: GrantRoleParams): Promise<{ granted: boolean }> {
  const { query, email, role } = params;
  const user = await findUserByEmail({ query, email });
  if (!user) throw new Error(`Usuário não encontrado: ${email}`);

  if (user.roles.includes(role)) return { granted: false };

  await query({
    text: 'UPDATE users SET roles = $1 WHERE id = $2',
    values: [serializeRoles([...user.roles, role]), user.id],
  });
  return { granted: true };
}
