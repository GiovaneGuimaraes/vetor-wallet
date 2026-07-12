import bcrypt from 'bcryptjs';
import { db } from '../db';
import type { User } from '@vetor-wallet/shared';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createUser(email: string, password: string): Promise<User> {
  const passwordHash = await hashPassword(password);
  const insert = await db.execute({
    sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    args: [email.toLowerCase().trim(), passwordHash],
  });
  const id = Number(insert.lastInsertRowid ?? 0);

  // Claim any orphaned rows (pre-auth data) for the first user
  await db.batch(
    [
      { sql: 'UPDATE operations SET user_id = ? WHERE user_id IS NULL', args: [id] },
      { sql: 'UPDATE alert_rules SET user_id = ? WHERE user_id IS NULL', args: [id] },
    ],
    'write',
  );

  return { id, email: email.toLowerCase().trim(), created_at: new Date().toISOString() };
}

export async function findUserByEmail(email: string): Promise<(User & { password_hash: string }) | null> {
  const result = await db.execute({
    sql: 'SELECT id, email, password_hash, created_at FROM users WHERE email = ?',
    args: [email.toLowerCase().trim()],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    email: row.email as string,
    password_hash: row.password_hash as string,
    created_at: row.created_at as string,
  };
}

export async function userExists(email: string): Promise<boolean> {
  const result = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [email.toLowerCase().trim()],
  });
  return result.rows.length > 0;
}
