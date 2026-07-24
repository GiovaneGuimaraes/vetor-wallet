import { Outlet, useLocation } from 'react-router-dom';
import type { User } from '@vetor-wallet/shared';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { mascotSrcForPathname } from './mascots';
import type { ShellContext } from './ShellContext';

interface Props {
  user: User;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  outletContext: ShellContext;
}

/**
 * Shell v4: header sticky compartilhado (logo dinâmica por layer + saudação +
 * toggle de tema + sair) e área de conteúdo com animação de entrada. Rotas
 * filhas recebem `ShellContext` via <Outlet context={...} /> — ver
 * `web/src/layout/ShellContext.ts`.
 */
export function AppShell({ user, theme, onToggleTheme, onLogout, outletContext }: Props) {
  const location = useLocation();
  const mascotSrc = mascotSrcForPathname(location.pathname);
  const firstName = user.email.split('@')[0];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="vw-header">
        <div className="vw-header-inner">
          <div className="vw-logo">
            <img
              key={mascotSrc}
              src={mascotSrc}
              alt=""
              width={56}
              height={56}
              className="vw-logo-mascot"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            <span className="vw-wordmark">vetor</span>
          </div>

          <div className="vw-header-right">
            <span className="vw-greeting">Olá, {firstName}</span>
            <ThemeToggleButton theme={theme} onToggle={onToggleTheme} />
            <button type="button" onClick={onLogout} className="vw-logout-btn">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main key={location.pathname} className="vw-main vw-rise">
        <Outlet context={outletContext} />
      </main>
    </div>
  );
}
