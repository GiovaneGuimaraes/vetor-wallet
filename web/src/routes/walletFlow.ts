import type { Wallet } from '@vetor-wallet/shared';

/**
 * Decisão pura do fluxo da rota `/carteiras` (T-027 — "modo carteira única").
 * Decisão do humano (2026-07-24): uma carteira só resolve — não precisa da
 * página de várias carteiras. Extraída como função pura (sem I/O, sem router)
 * para ser testável isoladamente; `CarteirasPage.tsx` só interpreta o
 * resultado (navegar, criar, ou renderizar a lista).
 *
 * - 0 carteiras → cria a "Principal" automaticamente (o próprio
 *   `CarteirasPage` chama `POST /api/wallets` via `onCreateWallet`; nenhuma
 *   rota nova no server).
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
  | { action: 'list' };

export function decideWalletFlow(wallets: Pick<Wallet, 'id'>[], forceList: boolean): WalletFlowDecision {
  if (wallets.length === 0) return { action: 'create' };
  if (wallets.length === 1 && !forceList) return { action: 'redirect', walletId: wallets[0].id };
  return { action: 'list' };
}
