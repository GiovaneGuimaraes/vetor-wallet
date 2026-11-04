import type { User } from '@vetor-wallet/shared';
import { parseRoles } from './parseRoles';

export interface UserRow {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  created_at: string;
  roles: unknown;
}

/** Linha de `users` → `User` (sem `password_hash`). */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? null,
    phone: row.phone ?? null,
    created_at: row.created_at,
    roles: parseRoles(row.roles),
  };
}
