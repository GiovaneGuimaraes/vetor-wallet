import { useState, type FormEvent } from 'react';
import { login, register } from '../api';
import type { User } from '@vetor-wallet/shared';

interface Props {
  onAuth: (user: User) => void;
}

const field =
  'w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-sm text-ink ' +
  'placeholder:text-dim/50 focus:outline-none focus:border-accent focus:ring-1 ' +
  'focus:ring-accent/40 transition-colors';

const label = 'block text-xs font-medium text-dim uppercase tracking-wide mb-1.5';

export function AuthPage({ onAuth }: Props) {
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
      const user = mode === 'login' ? await login(email, password) : await register(email, password);
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
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-accent">Vetor Wallet</h1>
          <p className="text-sm text-dim mt-1">Carteira B3 pessoal</p>
        </div>

        <div className="bg-card border border-edge rounded-2xl p-6 shadow-sm">
          {/* Tabs */}
          <div className="flex rounded-lg overflow-hidden border border-edge mb-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-accent text-white'
                  : 'text-dim hover:text-ink hover:bg-raised/50'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-accent text-white'
                  : 'text-dim hover:text-ink hover:bg-raised/50'
              }`}
            >
              Criar conta
            </button>
          </div>

          {error && (
            <div className="mb-4 text-sm text-down bg-down/10 border border-down/25 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <span className={label}>E-mail</span>
              <input
                className={field}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <span className={label}>Senha</span>
              <input
                className={field}
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
                <span className={label}>Confirmar senha</span>
                <input
                  className={field}
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
              className="w-full bg-accent hover:bg-accent-hover text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-1"
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
      </div>
    </div>
  );
}
