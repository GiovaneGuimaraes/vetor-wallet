import { WalletSelector } from '../components/WalletSelector';
import { useShellContext } from '../layout/ShellContext';

/**
 * Rota `/carteiras` (T-004): grid de carteiras de ações. Reaproveita
 * `WalletSelector` (embedded — sem seu próprio header, que já é coberto
 * pelo `AppShell`).
 */
export function CarteirasPage() {
  const { user, wallets, walletSummaries, onSelectWallet, onCreateWallet, theme } = useShellContext();

  return (
    <WalletSelector
      embedded
      user={user}
      wallets={wallets}
      walletSummaries={walletSummaries}
      onSelect={onSelectWallet}
      onCreateWallet={onCreateWallet}
      onLogout={() => {
        /* sair já fica no header do AppShell nesta rota */
      }}
      theme={theme}
      onToggle={() => {
        /* toggle já fica no header do AppShell nesta rota */
      }}
    />
  );
}
