import { Navigate } from 'react-router-dom';
import type { User } from '@vetor-wallet/shared';
import { AppShell } from './AppShell';
import { LoadingScreen } from './LoadingScreen';
import type { ShellContext } from './ShellContext';

interface Props {
  user: User | null | 'loading';
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  buildShellContext: (user: User) => ShellContext;
}

/**
 * Guard de autenticação para as rotas protegidas (T-004): sessão ainda
 * carregando → tela neutra; sem sessão → redireciona para `/` (deep-link
 * protegido sem login cai na landing). Sessão válida → renderiza o shell
 * (header sticky + Outlet) reaproveitando o estado de `App.tsx`.
 */
export function ProtectedShell({ user, theme, onToggleTheme, onLogout, buildShellContext }: Props) {
  if (user === 'loading') return <LoadingScreen />;
  if (!user) return <Navigate to="/" replace />;

  return (
    <AppShell
      user={user}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onLogout={onLogout}
      outletContext={buildShellContext(user)}
    />
  );
}
