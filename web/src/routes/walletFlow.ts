import type { Wallet } from '@vetor-wallet/shared';

/**
 * Decisão pura do fluxo da rota `/carteiras` (T-027 — "modo carteira única").
 * Decisão do humano (2026-07-24): uma carteira só resolve — não precisa da
 * página de várias carteiras. Extraída como função pura (sem I/O, sem router)
 * para ser testável isoladamente; `CarteirasPage.tsx` só interpreta o
 * resultado (navegar, criar, mostrar erro, ou renderizar a lista).
 *
 * - `hadLoadError && wallets.length === 0` → estado de erro (`error`): a
 *   última busca de carteiras falhou (rede/timeout) e `wallets` está vazio
 *   só por causa disso — **nunca** interpretar como "usuário sem carteira"
 *   e disparar a criação automática, ou uma falha transitória mascararia
 *   carteiras reais do usuário atrás de uma "Principal" espúria (achado do
 *   revisor na primeira rodada desta tarefa). Se `wallets` já tem itens de
 *   uma carga anterior bem-sucedida, uma falha na busca seguinte não conta
 *   como ambígua — segue a decisão normal com os dados que já temos.
 * - 0 carteiras (sem erro de carga) → cria a "Principal" automaticamente (o
 *   próprio `CarteirasPage` chama `POST /api/wallets` via `onCreateWallet`;
 *   nenhuma rota nova no server).
 * - Exatamente 1 carteira → vai direto para o dashboard dela, a menos que o
 *   usuário tenha pedido explicitamente a lista (`forceList`, acionado pelo
 *   query param `?manage=1` — o caminho preservado para criar uma segunda
 *   carteira sem cair num loop de redirect).
 * - 2+ carteiras (dados legados ou uso deliberado de múltiplas carteiras) →
 *   lista de sempre, comportamento inalterado.
 */
export type WalletFlowDecision =
  | { action: 'create' }
  | { action: 'redirect'; walletId: number }
  | { action: 'list' }
  | { action: 'error' };

export function decideWalletFlow(
  wallets: Pick<Wallet, 'id'>[],
  forceList: boolean,
  hadLoadError: boolean,
): WalletFlowDecision {
  if (hadLoadError && wallets.length === 0) return { action: 'error' };
  if (wallets.length === 0) return { action: 'create' };
  if (wallets.length === 1 && !forceList) return { action: 'redirect', walletId: wallets[0].id };
  return { action: 'list' };
}
