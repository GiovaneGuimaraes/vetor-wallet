import { Link, Outlet, useLocation } from 'react-router-dom';
import type { User } from '@vetor-wallet/shared';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import type { ShellContext } from './ShellContext';
import { greetingName } from '../routes/conta';

interface Props {
  user: User;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  outletContext: ShellContext;
}

/**
 * Shell v4: header sticky compartilhado (logo oficial fixa + saudação +
 * toggle de tema + sair) e área de conteúdo com animação de entrada. Rotas
 * filhas recebem `ShellContext` via <Outlet context={...} /> — ver
 * `web/src/layout/ShellContext.ts`.
 *
 * T-020: a logo do header deixou de trocar por layer e passou a ser fixa
 * (`/logo.png`, recorte transparente que funciona em light e dark); os
 * mascotes por layer continuam, mas nas respectivas pages (ver `mascots.ts`).
 */
export function AppShell({ user, theme, onToggleTheme, onLogout, outletContext }: Props) {
  const location = useLocation();
  // T-093: saúda pelo primeiro nome real (`user.name`) quando cadastrado;
  // senão mantém o fallback pré-T-093 (prefixo do e-mail) — lógica pura e
  // testada em `routes/conta.ts` (`greetingName`).
  const firstName = greetingName(user.name, user.email);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="vw-header">
        <div className="vw-header-inner">
          <Link to="/home" className="vw-logo vw-logo-link" aria-label="Ir para a página inicial">
            <img
              src="/logo.png"
              alt=""
              width={56}
              height={56}
              className="vw-logo-mascot"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            <span className="vw-wordmark">vetor</span>
          </Link>

          <div className="vw-header-right">
            <span className="vw-greeting">Olá, {firstName}</span>
            <Link to="/planos" className="vw-planos-link">
              Planos
            </Link>
            <Link to="/conta" className="vw-planos-link">
              Conta
            </Link>
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
