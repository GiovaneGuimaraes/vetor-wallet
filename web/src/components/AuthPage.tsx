import { useState, type FormEvent } from 'react';
import { login, register } from '../api';
import type { User } from '@vetor-wallet/shared';

interface Props {
  onAuth: (user: User) => void;
  theme: 'dark' | 'light';
  onToggle: () => void;
}

function SunIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Alternar tema"
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '1px solid var(--color-edge)',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'var(--color-dim)',
        flexShrink: 0,
        transition: 'color 0.15s',
      }}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

const labelClass = 'block text-xs font-medium text-dim uppercase tracking-wide mb-1.5';

const inputClass =
  'auth-input w-full bg-canvas border border-edge px-3 py-2.5 text-sm text-ink ' +
  'placeholder:text-dim/50 transition-colors';

export function AuthPage({ onAuth, theme, onToggle }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'register' && password !== confirm) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);
    try {
      const user =
        mode === 'login'
          ? await login(email, password)
          : await register(email, password);
      onAuth(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  }

  return (
    <>
      <style>{`
        .auth-input {
          border-radius: 10px;
        }
        .auth-input:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px rgba(var(--accent-rgb), .18);
        }
        .auth-submit {
          transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
        }
        .auth-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(var(--accent-rgb), .22);
        }
        .auth-seg-btn {
          transition: color 0.15s, background 0.15s, box-shadow 0.15s;
        }
        .auth-seg-btn.inactive:hover {
          color: var(--color-mid);
        }
        .auth-wordmark {
          font-size: 26px;
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.2;
          background: linear-gradient(135deg, var(--color-accent), var(--color-accent-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>

      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 gap-6"
        style={{
          backgroundImage:
            'radial-gradient(90% 60% at 50% -10%, rgba(var(--accent-rgb),.12), transparent 60%)',
          backgroundColor: 'var(--color-canvas)',
        }}
      >
        {/* Wordmark */}
        <div className="text-center">
          <h1 className="auth-wordmark">Vetor Wallet</h1>
          <p className="text-dim mt-1.5" style={{ fontSize: 14 }}>
            Carteira B3 pessoal
          </p>
        </div>

        {/* Card */}
        <div
          className="w-full max-w-sm border border-edge"
          style={{
            padding: 26,
            borderRadius: 16,
            background: 'linear-gradient(180deg, var(--card-1), var(--card-2))',
            boxShadow: '0 24px 80px rgba(0,0,0,.45)',
          }}
        >
          {/* Segmented control */}
          <div
            className="flex border border-edge mb-5"
            style={{
              background: 'var(--card-2)',
              borderRadius: 10,
              padding: 3,
              gap: 3,
            }}
          >
            {(['login', 'register'] as const).map((m) => {
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`auth-seg-btn flex-1 py-1.5 text-sm font-medium cursor-pointer ${isActive ? '' : 'inactive'}`}
                  style={{
                    borderRadius: 8,
                    ...(isActive
                      ? {
                          background: 'linear-gradient(135deg, var(--btn-1), var(--btn-2))',
                          color: 'var(--btn-ink)',
                          boxShadow: '0 1px 6px rgba(0,0,0,.25)',
                        }
                      : {
                          background: 'transparent',
                          color: 'var(--color-dim)',
                        }),
                  }}
                >
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              );
            })}
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 text-sm text-down bg-down/10 border border-down/25 px-3 py-2" style={{ borderRadius: 10 }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <span className={labelClass}>E-mail</span>
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <span className={labelClass}>Senha</span>
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>

            {mode === 'register' && (
              <div>
                <span className={labelClass}>Confirmar senha</span>
                <input
                  className={inputClass}
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="auth-submit w-full text-sm font-semibold py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-1"
              style={{
                borderRadius: 10,
                background: 'linear-gradient(135deg, var(--btn-1), var(--btn-2))',
                color: 'var(--btn-ink)',
              }}
            >
              {loading
                ? mode === 'login'
                  ? 'Entrando...'
                  : 'Criando conta...'
                : mode === 'login'
                  ? 'Entrar'
                  : 'Criar conta'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3">
          <p className="text-dim" style={{ fontSize: 12 }}>
            Suas cotações via brapi.dev · dados criptografados
          </p>
          <ThemeToggle theme={theme} onToggle={onToggle} />
        </div>
      </div>
    </>
  );
}
