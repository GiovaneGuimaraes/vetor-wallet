import type { Query } from '@vetor-wallet/query';
import type { User } from '@vetor-wallet/shared';
import { normalizePhone } from './normalizePhone';
import { toUser, type UserRow } from './toUser';

export interface ProfileUpdate {
  name?: string | null;
  phone?: string | null;
}

export interface UpdateUserProfileParams {
  query: Query;
  userId: number;
  update: ProfileUpdate;
}

/**
 * PATCH parcial de name/phone. Cada campo presente em `update` já foi validado
 * pelo router (string válida ou `null` para limpar); aqui só persiste.
 * `'name' in update` (não truthiness) distingue "ausente" de `null`.
 */
export async function updateUserProfile(params: UpdateUserProfileParams): Promise<User | null> {
  const { query, userId, update } = params;
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if ('name' in update) {
    values.push(update.name === null ? null : update.name!.trim());
    sets.push(`name = $${values.length}`);
  }
  if ('phone' in update) {
    values.push(update.phone === null ? null : normalizePhone(update.phone!));
    sets.push(`phone = $${values.length}`);
  }

  if (sets.length > 0) {
    values.push(userId);
    await query({
      text: `UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`,
      values,
    });
  }

  const result = await query<UserRow>({
    text: 'SELECT id, email, name, phone, created_at, roles FROM users WHERE id = $1',
    values: [userId],
  });
  if (result.rows.length === 0) return null;
  return toUser(result.rows[0]);
}
