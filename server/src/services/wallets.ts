import { db } from '../db';
import type { Row } from '@libsql/client';

/**
 * Carteira única (T-050).
 *
 * O app deixou de suportar mais de uma carteira de ações por usuário: o escopo
 * de toda leitura é o USUÁRIO e a carteira virou só um rótulo do registro. Este
 * service concentra a criação/adoção da carteira padrão, que antes vivia inline
 * no `GET /api/wallets`.
 *
 * A invariante é de APLICAÇÃO, não de banco: não há índice `UNIQUE(user_id)` em
 * `wallets`, porque bases legadas podem ter 2+ carteiras e o índice quebraria o
 * boot delas. Essas carteiras continuam existindo e sendo listadas; o que muda é
 * que nenhuma leitura filtra por elas e nenhuma nova pode ser criada.
 */

export const DEFAULT_WALLET = {
  name: 'Carteira B3 pessoal',
  description: 'Ações · longo prazo',
  color: '#e3d5b8',
} as const;

/**
 * Carteira mais antiga do usuário — a "padrão". Desempate por `id` porque
 * `created_at` tem resolução de segundos e duas carteiras legadas podem
 * compartilhar o mesmo instante.
 */
export async function findDefaultWallet(userId: number): Promise<Row | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM wallets WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 1',
    args: [userId],
  });
  return result.rows[0] ?? null;
}

export async function countWallets(userId: number): Promise<number> {
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM wallets WHERE user_id = ?',
    args: [userId],
  });
  return Number(result.rows[0]?.n ?? 0);
}

/**
 * Id da carteira padrão do usuário, criando-a se ainda não existir. Ao criar,
 * adota as operações órfãs (`wallet_id IS NULL`) — dado legado de antes de
 * `wallets` existir.
 *
 * Tolerante a corrida: depois do INSERT relê a mais antiga, então dois requests
 * simultâneos convergem para a mesma carteira (a de menor `id` vence) em vez de
 * cada um usar a sua.
 */
export async function getOrCreateDefaultWallet(userId: number): Promise<number> {
  const existing = await findDefaultWallet(userId);
  if (existing) return Number(existing.id);

  await db.execute({
    sql: 'INSERT INTO wallets (user_id, name, description, color) VALUES (?, ?, ?, ?)',
    args: [userId, DEFAULT_WALLET.name, DEFAULT_WALLET.description, DEFAULT_WALLET.color],
  });

  const winner = await findDefaultWallet(userId);
  const walletId = Number(winner?.id ?? 0);

  await db.execute({
    sql: 'UPDATE operations SET wallet_id = ? WHERE user_id = ? AND wallet_id IS NULL',
    args: [walletId, userId],
  });

  return walletId;
}
