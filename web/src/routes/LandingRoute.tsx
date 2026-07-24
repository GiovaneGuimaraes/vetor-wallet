import { Navigate } from 'react-router-dom';
import type { User } from '@vetor-wallet/shared';
import { AuthPage } from '../components/AuthPage';
import { LoadingScreen } from '../layout/LoadingScreen';

interface Props {
  user: User | null | 'loading';
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onAuth: (user: User) => void;
}

/**
 * Rota `/` (T-004): landing/login. Usuário já autenticado é redirecionado
 * para `/home` (guard "logado em `/` → `/home`").
 */
export function LandingRoute({ user, theme, onToggleTheme, onAuth }: Props) {
  if (user === 'loading') return <LoadingScreen />;
  if (user) return <Navigate to="/home" replace />;
  return <AuthPage onAuth={onAuth} theme={theme} onToggle={onToggleTheme} />;
}
