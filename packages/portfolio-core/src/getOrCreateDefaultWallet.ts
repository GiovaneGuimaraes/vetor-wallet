import type { Query } from '@vetor-wallet/query';
import { findDefaultWallet } from './findDefaultWallet';

/** Carteira com que todo usuário nasce (T-050). */
export const DEFAULT_WALLET = {
  name: 'Carteira B3 pessoal',
  description: 'Ações · longo prazo',
  color: '#e3d5b8',
} as const;

export interface GetOrCreateDefaultWalletParams {
  query: Query;
  userId: number;
  /**
   * T-053: substitui `name`/`description`/`color` do `DEFAULT_WALLET` já no
   * INSERT — usado por `POST /api/wallets` para a carteira nascer com os dados
   * do body sem UPDATE depois (a janela create→UPDATE não tinha caminho de
   * reparo, e não há `PATCH /api/wallets`). `GET /api/wallets` e `createUser`
   * chamam sem `overrides`.
   */
  overrides?: { name?: string; description?: string; color?: string };
}

/**
 * Id da carteira padrão do usuário, criando-a se ainda não existir. Ao criar,
 * adota as operações órfãs (`wallet_id IS NULL`) — dado legado de antes de
 * `wallets` existir.
 *
 * A invariante "carteira única" é de APLICAÇÃO, não de banco: não há índice
 * `UNIQUE(user_id)` em `wallets`, porque bases legadas podem ter 2+ carteiras e
 * o índice quebraria o boot delas.
 *
 * Tolerante a corrida: depois do INSERT relê a mais antiga, então dois requests
 * simultâneos convergem para a mesma carteira (a de menor `id` vence). Efeito
 * colateral aceito: os dois INSERTs acontecem, e o perdedor deixa uma linha de
 * carteira ÓRFÃ (nenhuma operação é adotada por ela, pois o UPDATE de adoção
 * mira a vencedora) que o GET volta a listar. Nenhuma leitura depende dela —
 * só uma linha extra visível. Não vale corrigir com DELETE compensatório (mais
 * uma escrita na janela de corrida) nem com `UNIQUE(user_id)` (ver acima). Com
 * `overrides`, a corrida também decide o NOME: o primeiro INSERT vence.
 */
export async function getOrCreateDefaultWallet(
  params: GetOrCreateDefaultWalletParams
): Promise<number> {
  const { query, userId, overrides } = params;

  const existing = await findDefaultWallet({ query, userId });
  if (existing) return Number(existing.id);

  const name = overrides?.name ?? DEFAULT_WALLET.name;
  const description = overrides?.description ?? DEFAULT_WALLET.description;
  const color = overrides?.color ?? DEFAULT_WALLET.color;

  // Sem `RETURNING id` de propósito: o id que vale é o da RELEITURA abaixo
  // (a mais antiga), não o deste INSERT — é o que faz a corrida convergir.
  await query({
    text: 'INSERT INTO wallets (user_id, name, description, color) VALUES ($1, $2, $3, $4)',
    values: [userId, name, description, color],
  });

  const winner = await findDefaultWallet({ query, userId });
  const walletId = Number(winner?.id ?? 0);

  await query({
    text: 'UPDATE operations SET wallet_id = $1 WHERE user_id = $2 AND wallet_id IS NULL',
    values: [walletId, userId],
  });

  return walletId;
}
