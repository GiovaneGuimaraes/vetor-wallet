import type { User, Wallet, PortfolioSummary } from '@vetor-wallet/shared';
import { useOutletContext } from 'react-router-dom';

/**
 * Dados/callbacks compartilhados entre as rotas protegidas, expostos via
 * `<Outlet context={...} />` em AppShell e consumidos com `useShellContext()`.
 * Evita prop-drilling manual através do <Outlet /> do react-router.
 *
 * T-050b: o contexto virou **singular** — o usuário tem uma carteira só e ela
 * é apenas um rótulo (nome/cor) no dashboard. Saíram `wallets: Wallet[]`,
 * `walletSummaries: Record<number, …>` e `onSelectWallet`; a criação da
 * carteira padrão foi internalizada em `App.tsx` (não há mais tela que a
 * dispare, logo nenhum consumidor precisa de `onCreateWallet`).
 */
export interface ShellContext {
  user: User;
  theme: 'dark' | 'light';
  /** A carteira do usuário; `null` enquanto não carregou ou se a busca falhou. */
  wallet: Wallet | null;
  /**
   * T-027: `wallet` começa `null` até a primeira busca (`getWallets`)
   * resolver — sem esse flag não haveria como distinguir "usuário sem
   * carteira nenhuma" de "ainda carregando", e o auto-create dispararia uma
   * carteira "Principal" espúria enquanto os dados reais não chegam.
   */
  walletLoaded: boolean;
  /**
   * T-027: true quando a última tentativa de `getWallets()` falhou (erro de
   * rede/timeout/resposta não-ok). Existe para distinguir "carregou e o
   * usuário realmente não tem carteira" de "falhou ao carregar" — sem essa
   * distinção, `wallet === null` por uma falha transitória seria interpretado
   * como "crie a carteira automaticamente", mascarando a carteira real do
   * usuário atrás do erro. Ver `decideWalletFlow`.
   */
  walletLoadError: boolean;
  /** Consolidado do usuário (`GET /api/portfolio`, sem filtro de carteira). */
  walletSummary: PortfolioSummary | null;
  refreshWallet: () => Promise<void>;
}

export function useShellContext(): ShellContext {
  return useOutletContext<ShellContext>();
}
