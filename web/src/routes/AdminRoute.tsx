import { Navigate } from 'react-router-dom';
import type { User } from '@vetor-wallet/shared';
import { AdminPage } from '../components/AdminPage';
import { LoadingScreen } from '../layout/LoadingScreen';

interface Props {
  user: User | null | 'loading';
  onLogout: () => Promise<void>;
}

/**
 * Rota `/admin` — fora da lista explícita de rotas da T-004, mas mantida
 * fora do shell (como já era antes: `AdminPage` tem seu próprio layout,
 * sem o header comum) para não regredir a funcionalidade existente. Só
 * acessível a usuários com role `admin`; sem sessão → `/`.
 */
export function AdminRoute({ user, onLogout }: Props) {
  if (user === 'loading') return <LoadingScreen />;
  if (!user) return <Navigate to="/" replace />;
  if (!user.roles.includes('admin')) return <Navigate to="/home" replace />;
  return <AdminPage user={user} onLogout={onLogout} />;
}
