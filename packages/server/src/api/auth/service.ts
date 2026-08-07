import bcrypt from 'bcryptjs';
import { db } from '@vetor-wallet/db';
import { getOrCreateDefaultWallet } from '../services/wallets';
import type { User } from '@vetor-wallet/shared';

const SALT_ROUNDS = 12;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

// Formato flexível: aceita com/sem +55, com/sem separadores (espaço, parênteses,
// hífen), DDD + 8 ou 9 dígitos. Normaliza para dígitos puros antes de validar o
// tamanho, então o valor persistido é sempre só números (com 55 na frente se o
// usuário digitou o código do país).
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

export function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw);
  // 10-11 dígitos = DDD + telefone (fixo 8, celular 9); +55 na frente soma 2
  // dígitos, então 12-13 também são aceitos.
  return /^(55)?\d{10,11}$/.test(digits);
}

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

  // Carteira única (T-050): o usuário já nasce com a carteira padrão, em vez de
  // esperar o lazy-create do primeiro GET /api/wallets. Falhar aqui NÃO derruba
  // o registro — o lazy-create das rotas continua sendo a rede de segurança.
  try {
    await getOrCreateDefaultWallet(id);
  } catch (err) {
    console.error('Falha ao criar a carteira padrao do usuario', id, err);
  }

  return {
    id,
    email: email.toLowerCase().trim(),
    name: null,
    phone: null,
    created_at: new Date().toISOString(),
    roles: [],
  };
}

export async function findUserByEmail(email: string): Promise<(User & { password_hash: string }) | null> {
  const result = await db.execute({
    sql: 'SELECT id, email, name, phone, password_hash, created_at, roles FROM users WHERE email = ?',
    args: [email.toLowerCase().trim()],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    password_hash: row.password_hash as string,
    created_at: row.created_at as string,
    roles: parseRoles(row.roles),
  };
}

// T-092: validação pura do nome — string 1–120 chars após trim, ou `null` para
// limpar o campo. Não aceita string vazia (use `null` para limpar).
export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 120;
}

export interface ProfileUpdate {
  name?: string | null;
  phone?: string | null;
}

// Aplica um PATCH parcial em name/phone. Cada campo presente no update já foi
// validado pelo router (string válida ou `null` para limpar); aqui só
// persiste. Retorna o User atualizado.
export async function updateUserProfile(userId: number, update: ProfileUpdate): Promise<User | null> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if ('name' in update) {
    sets.push('name = ?');
    args.push(update.name === null ? null : update.name!.trim());
  }
  if ('phone' in update) {
    sets.push('phone = ?');
    args.push(update.phone === null ? null : normalizePhone(update.phone!));
  }

  if (sets.length > 0) {
    args.push(userId);
    await db.execute({
      sql: `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }

  const result = await db.execute({
    sql: 'SELECT id, email, name, phone, created_at, roles FROM users WHERE id = ?',
    args: [userId],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    created_at: row.created_at as string,
    roles: parseRoles(row.roles),
  };
}

// Atualiza o password_hash direto (sem passar pelo fluxo de criação); quem
// chama já validou a senha atual (verifyPassword) e a nova senha (mesma
// regra do register, >= 8 chars) — aqui só hash + persistência (T-094).
export async function updateUserPassword(userId: number, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db.execute({
    sql: 'UPDATE users SET password_hash = ? WHERE id = ?',
    args: [passwordHash, userId],
  });
}

export async function findUserById(userId: number): Promise<(User & { password_hash: string }) | null> {
  const result = await db.execute({
    sql: 'SELECT id, email, name, phone, password_hash, created_at, roles FROM users WHERE id = ?',
    args: [userId],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
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
