import type { User, Wallet, PortfolioSummary, NewWallet } from '@vetor-wallet/shared';
import { useOutletContext } from 'react-router-dom';

/**
 * Dados/callbacks compartilhados entre as rotas protegidas, expostos via
 * `<Outlet context={...} />` em AppShell e consumidos com `useShellContext()`.
 * Evita prop-drilling manual através do <Outlet /> do react-router.
 */
export interface ShellContext {
  user: User;
  theme: 'dark' | 'light';
  wallets: Wallet[];
  /**
   * T-027: `wallets` começa vazio até a primeira busca (`getWallets`)
   * resolver — sem esse flag, a rota `/carteiras` não teria como distinguir
   * "usuário sem carteira nenhuma" de "ainda carregando", e criaria uma
   * carteira "Principal" espúria enquanto os dados reais não chegam.
   */
  walletsLoaded: boolean;
  /**
   * T-027: true quando a última tentativa de `getWallets()` falhou (erro de
   * rede/timeout/resposta não-ok). Existe para distinguir "carregou e o
   * usuário realmente não tem carteira nenhuma" de "falhou ao carregar" —
   * sem essa distinção, `wallets === []` por uma falha transitória seria
   * interpretado como "crie a carteira Principal automaticamente",
   * mascarando carteiras reais do usuário atrás do erro.
   */
  walletsLoadError: boolean;
  walletSummaries: Record<number, PortfolioSummary>;
  onCreateWallet: (data: NewWallet) => Promise<void>;
  onSelectWallet: (wallet: Wallet) => void;
  refreshWallets: () => Promise<void>;
}

export function useShellContext(): ShellContext {
  return useOutletContext<ShellContext>();
}
