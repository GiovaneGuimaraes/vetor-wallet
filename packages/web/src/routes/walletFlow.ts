import type { Wallet } from '@vetor-wallet/shared';

/**
 * Decisão pura do fluxo de carteira do web (T-050b, reescrita da T-027).
 *
 * Desde a T-050 o usuário tem UMA carteira só — ela é um rótulo, não uma
 * entidade que ele escolhe/gerencia. Não há mais rota `/carteiras`, seleção
 * nem "criar segunda carteira"; o que sobrou é decidir o que o shell mostra
 * enquanto a carteira do usuário não está resolvida:
 *
 * - `'loading'` — a primeira busca de `/api/wallets` ainda não terminou. Nada
 *   é decidido antes disso (a ausência de carteira ainda é desconhecida).
 * - `'error'` — a última busca falhou E não temos nenhuma carteira carregada.
 *   **Invariante herdada da T-027 (achado bloqueante do revisor):** essa
 *   combinação NUNCA pode virar `'create'`. `wallet === null` por falha de
 *   rede é indistinguível de "usuário sem carteira" sem esse flag, e criar
 *   automaticamente nesse caso mascararia a carteira real do usuário atrás de
 *   uma "Principal" espúria. Se já temos uma carteira de uma carga anterior
 *   bem-sucedida, uma falha na busca seguinte não é ambígua — segue `'ready'`.
 * - `'create'` — carregou, sem erro, e o usuário realmente não tem carteira.
 *   Caminho de exceção: desde a T-050a o `createUser` já cria a padrão e o
 *   `GET /api/wallets` faz lazy-create. Sobra para bases anteriores a isso.
 * - `'ready'` — há carteira; o dashboard pode renderizar.
 */
export type WalletFlowState = 'loading' | 'error' | 'create' | 'ready';

export function decideWalletFlow(
  wallet: Pick<Wallet, 'id'> | null,
  loaded: boolean,
  hadLoadError: boolean
): WalletFlowState {
  if (!loaded) return 'loading';
  if (wallet) return 'ready';
  if (hadLoadError) return 'error';
  return 'create';
}

/**
 * A carteira do usuário, dada a lista que o `GET /api/wallets` devolveu.
 *
 * Espelho no web da regra do server (`findDefaultWallet`, T-050a): a carteira
 * é a **mais antiga**, desempatada por `id`. Aqui usamos só o menor `id` —
 * `created_at` tem resolução de segundos e o `id` é monotônico, então o menor
 * id é sempre a mais antiga e não dependemos da ordem em que a lista chegou.
 *
 * Numa base legada com 2+ carteiras isso escolhe apenas o RÓTULO exibido; o
 * dashboard continua mostrando o consolidado de todas (o server agrega por
 * usuário, sem filtro de carteira).
 */
export function resolvePrimaryWallet(wallets: Wallet[]): Wallet | null {
  let primary: Wallet | null = null;
  for (const w of wallets) {
    if (primary === null || w.id < primary.id) primary = w;
  }
  return primary;
}
