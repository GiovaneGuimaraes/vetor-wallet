import { useState, type FormEvent } from 'react';
import { login, register } from '../api';
import type { User } from '@vetor-wallet/shared';
import { ThemeToggleButton } from './ThemeToggleButton';

interface Props {
  onAuth: (user: User) => void;
  theme: 'dark' | 'light';
  onToggle: () => void;
}

interface FeatureConfig {
  key: string;
  mascot: string;
  title: string;
  desc: string;
}

const FEATURES: FeatureConfig[] = [
  { key: 'renda-despesas', mascot: 'receitas-t.png', title: 'Renda e despesas', desc: 'Organize entradas e gastos fixos do mês' },
  { key: 'poupanca', mascot: 'poupanca-t.png', title: 'Poupança', desc: 'Acompanhe saldo, aportes e rendimento' },
  { key: 'acoes', mascot: 'acoes-t.png', title: 'Ações', desc: 'Carteiras da B3 com cotações em tempo real' },
  { key: 'metas', mascot: 'metas-t.png', title: 'Metas', desc: 'Defina objetivos e acompanhe o progresso' },
];

const labelClass = 'block text-xs font-medium text-dim uppercase tracking-wide mb-1.5';

const inputClass =
  'w-full bg-canvas border border-edge px-3 py-2.5 text-sm text-ink ' +
  'placeholder:text-dim/50 transition-colors';

/**
 * Landing + Login (T-005). Card de apresentação (mascotes + funções) ao
 * lado do form de autenticação — fluxo de auth (login/register) contra o
 * server permanece o mesmo, só o layout/visual mudou para o padrão v4
 * (grid 1.5fr/1fr, tokens de web/src/index.css, classes .vw-* de T-003/T-004).
 */
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
    <div className="vw-landing-page">
      <div className="vw-landing-toggle">
        <ThemeToggleButton theme={theme} onToggle={onToggle} />
      </div>

      <div className="vw-landing-grid">
        {/* Card esquerdo: apresentação */}
        <div className="vw-landing-intro vw-card vw-rise">
          <div className="vw-landing-logo">
            <img src="/layers/receitas-t.png" alt="" className="vw-landing-logo-mascot" />
            <span className="vw-wordmark vw-landing-wordmark">vetor</span>
          </div>

          <h1 className="vw-landing-title">Sua vida financeira, organizada em camadas.</h1>
          <p className="vw-landing-desc">
            Renda, despesas, poupança, ações e metas — tudo em um só lugar, com cotações em
            tempo real da B3.
          </p>

          <ul className="vw-landing-features">
            {FEATURES.map((f) => (
              <li key={f.key} className="vw-landing-feature">
                <img src={`/layers/${f.mascot}`} alt="" className="vw-landing-feature-mascot" />
                <div>
                  <p className="vw-landing-feature-title">{f.title}</p>
                  <p className="vw-landing-feature-desc">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Card direito: login/cadastro */}
        <div className="vw-landing-auth vw-card vw-rise" style={{ ['--vw-rise-i' as string]: 1 }}>
          <h2 className="vw-landing-auth-title">
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </h2>

          {error && (
            <div
              className="mb-4 text-sm text-down bg-down/10 border border-down/25 px-3 py-2"
              style={{ borderRadius: 10 }}
            >
              {error}
            </div>
          )}

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
              className="vw-btn-primary w-full text-sm font-semibold py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-1"
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

          <p className="vw-landing-switch">
            {mode === 'login' ? (
              <>
                Não tem conta?{' '}
                <button type="button" className="vw-landing-switch-link" onClick={() => switchMode('register')}>
                  Criar conta
                </button>
              </>
            ) : (
              <>
                Já tem conta?{' '}
                <button type="button" className="vw-landing-switch-link" onClick={() => switchMode('login')}>
                  Entrar
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <p className="vw-landing-footer">Cotações via brapi.dev · dados criptografados</p>
    </div>
  );
}
