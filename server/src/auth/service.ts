import bcrypt from 'bcryptjs';
import { db } from '../db';
import type { User } from '@vetor-wallet/shared';

const SALT_ROUNDS = 12;

export function parseRoles(json: unknown): string[] {
  try {
    const parsed = JSON.parse(typeof json === 'string' ? json : '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeRoles(roles: string[]): string {
  return JSON.stringify(roles);
}

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
  return { id, email: email.toLowerCase().trim(), created_at: new Date().toISOString(), roles: [] };
}

export async function findUserByEmail(email: string): Promise<(User & { password_hash: string }) | null> {
  const result = await db.execute({
    sql: 'SELECT id, email, password_hash, created_at, roles FROM users WHERE email = ?',
    args: [email.toLowerCase().trim()],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    email: row.email as string,
    password_hash: row.password_hash as string,
    created_at: row.created_at as string,
    roles: parseRoles(row.roles),
  };
}

export async function userExists(email: string): Promise<boolean> {
  const result = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [email.toLowerCase().trim()],
  });
  return result.rows.length > 0;
}

export async function grantRole(email: string, role: string): Promise<{ granted: boolean }> {
  const user = await findUserByEmail(email);
  if (!user) throw new Error(`Usuário não encontrado: ${email}`);

  if (user.roles.includes(role)) return { granted: false };

  await db.execute({
    sql: 'UPDATE users SET roles = ? WHERE id = ?',
    args: [serializeRoles([...user.roles, role]), user.id],
  });
  return { granted: true };
}
