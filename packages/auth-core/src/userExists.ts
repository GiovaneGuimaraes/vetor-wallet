import type { Query } from '@vetor-wallet/query';

export interface UserExistsParams {
  query: Query;
  email: string;
}

export async function userExists(params: UserExistsParams): Promise<boolean> {
  const { query, email } = params;
  const result = await query({
    text: 'SELECT id FROM users WHERE email = $1',
    values: [email.toLowerCase().trim()],
  });
  return result.rows.length > 0;
}
