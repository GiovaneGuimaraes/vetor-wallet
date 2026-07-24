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
  walletSummaries: Record<number, PortfolioSummary>;
  onCreateWallet: (data: NewWallet) => Promise<void>;
  onSelectWallet: (wallet: Wallet) => void;
  refreshWallets: () => Promise<void>;
}

export function useShellContext(): ShellContext {
  return useOutletContext<ShellContext>();
}
