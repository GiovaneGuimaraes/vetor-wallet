import { useState, type FormEvent } from 'react';
import {
  confirmSignUp,
  forgotPassword,
  login,
  register,
  resendConfirmationCode,
  resetPassword,
} from '../api';
import { interpretRegisterResult } from '../routes/authRegister';
import {
  CONFIRMATION_CODE_LENGTH,
  confirmDisabledReason,
  interpretAuthError,
  normalizeConfirmationCode,
} from '../routes/authConfirm';
import { forgotDisabledReason, resetDisabledReason } from '../routes/authForgotPassword';
import { passwordPolicyMet, passwordRules } from '../routes/passwordPolicy';
import type { User } from '@vetor-wallet/shared';
import { ThemeToggleButton } from './ThemeToggleButton';
import { PLUGGY_BRAND, pluggySecurityNotes } from '../routes/pluggyImport';
import './pluggyImport.css';

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
  {
    key: 'renda',
    mascot: 'receitas-t.png',
    title: 'Renda',
    desc: 'Organize entradas fixas e avulsas do mês',
  },
  {
    key: 'despesas',
    mascot: 'despesas-t.png',
    title: 'Despesas',
    desc: 'Organize despesas fixas e gastos variáveis',
  },
  {
    key: 'poupanca',
    mascot: 'poupanca-t.png',
    title: 'Poupança',
    desc: 'Acompanhe saldo, aportes e rendimento',
  },
  {
    key: 'acoes',
    mascot: 'acoes-t.png',
    title: 'Ações',
    desc: 'Carteiras da B3 com cotações em tempo real',
  },
  // Metas saiu desta lista na T-089g (pedido do humano) e, na T-091b1, do app
  // inteiro — rota, card da Home e backend. Nada a reanunciar aqui.
];

/**
 * A etapa `confirm` só existe quando o user pool exige verificação de e-mail
 * (T-106). `forgot`/`reset` são a recuperação de senha (T-108b): pede e-mail,
 * depois código + senha nova — mesma forma de duas etapas do cadastro, com o
 * mesmo par código/reenviar reaproveitado.
 */
type Mode = 'login' | 'register' | 'confirm' | 'forgot' | 'reset';

/**
 * Cada campo é embrulhado num `<label>` (e não numa `<div>`), o que associa o
 * texto ao `<input>` sem precisar de `id`/`htmlFor`. Antes eram `div` + `span`:
 * visualmente idêntico e **sem rótulo acessível nenhum** — leitor de tela
 * anunciava só "caixa de edição" na tela de login, e clicar no texto não
 * focava o campo. Achado ao escrever o teste de render da T-092.
 */
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
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // T-106: o pool exige confirmação de e-mail, então o cadastro tem uma etapa a
  // mais. `pendingEmail` é o e-mail em curso na etapa de duas partes ativa —
  // o que o Cognito confirmou ter recebido no cadastro (vai no `/confirm` e no
  // `/resend-code`), ou o que a pessoa digitou na recuperação de senha (T-108b,
  // vai no `/forgot-password` e no `/reset-password`) — nunca o campo de e-mail
  // do formulário de login, que a pessoa pode seguir editando.
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [resending, setResending] = useState(false);
  // T-108b: senha nova da recuperação — campos próprios porque `password`/
  // `confirm` pertencem ao cadastro e continuam vivos se a pessoa voltar por ali.
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  /**
   * Entra na etapa de confirmação. Único caminho para `mode: 'confirm'`, porque
   * ela só faz sentido com um e-mail pendente — chegar lá com `pendingEmail`
   * vazio daria um POST sem `Username`.
   */
  function goToConfirmation(pending: string, message: string) {
    setPendingEmail(pending);
    setCode('');
    setError('');
    setNotice(message);
    setMode('confirm');
  }

  /**
   * Fecha o cadastro depois do código aceito.
   *
   * O `/confirm` responde 204 **sem criar sessão** (o código chegou por e-mail e
   * não prova posse da senha). Como a senha ainda está no estado desta tela —
   * digitada há segundos —, o login sai daqui e a pessoa não precisa redigitar
   * nada. Se ele falhar (senha trocada em outra aba, pool com MFA, rede), o
   * cadastro **já está confirmado**: a saída é a tela de login com aviso, nunca
   * um erro que sugira que a confirmação não valeu.
   */
  async function finishConfirmation() {
    if (!password) {
      backToLogin('Cadastro confirmado! Entre com o seu e-mail e senha.');
      return;
    }
    try {
      onAuth(await login(pendingEmail, password));
    } catch {
      backToLogin('Cadastro confirmado! Entre com o seu e-mail e senha.');
    }
  }

  function backToLogin(message: string) {
    setMode('login');
    setEmail(pendingEmail || email);
    setPassword('');
    setConfirm('');
    setCode('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setError('');
    setNotice(message);
  }

  /**
   * Entra na recuperação de senha (T-108b). Único caminho para `mode: 'forgot'`
   * — pré-preenche com o e-mail já digitado no login, mas a pessoa pode trocar
   * antes de enviar.
   */
  function goToForgotPassword() {
    setMode('forgot');
    setPendingEmail(email.trim());
    setCode('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setError('');
    setNotice('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'register' && !passwordPolicyMet(password)) {
      setError('A senha não atende aos requisitos listados abaixo do campo');
      return;
    }

    if (mode === 'register' && password !== confirm) {
      setError('As senhas não coincidem');
      return;
    }

    if (mode === 'reset' && !passwordPolicyMet(newPassword)) {
      setError('A senha nova não atende aos requisitos listados abaixo do campo');
      return;
    }

    if (mode === 'reset' && newPassword !== newPasswordConfirm) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'confirm') {
        await confirmSignUp(pendingEmail, code);
        await finishConfirmation();
      } else if (mode === 'login') {
        onAuth(await login(email, password));
      } else if (mode === 'forgot') {
        // 204 sempre (T-108a) — não prova que o e-mail existe. O texto abaixo
        // é deliberadamente condicional; ver `authForgotPassword.ts`.
        await forgotPassword(pendingEmail.trim());
        setCode('');
        setNewPassword('');
        setNewPasswordConfirm('');
        setNotice(
          'Se houver uma conta com esse e-mail, um código foi enviado. Confira também a caixa de spam.'
        );
        setMode('reset');
      } else if (mode === 'reset') {
        // Idem: 204 sempre, inclusive código errado ou vencido. O sucesso
        // desta chamada nunca vira "senha trocada" — só o login prova isso.
        await resetPassword({ email: pendingEmail.trim(), code, newPassword });
        backToLogin('Se o código estava certo, a senha nova já vale — tente entrar.');
      } else {
        const outcome = interpretRegisterResult(await register(email, password));
        if (outcome.kind === 'authenticated') onAuth(outcome.user);
        else goToConfirmation(outcome.email, outcome.message);
      }
    } catch (err) {
      // Um login recusado por cadastro pendente não é senha errada: é a mesma
      // etapa de código, alcançada por outra porta (cadastrou, fechou o app,
      // voltou depois). Sem este desvio a conta ficaria presa — o app não tem
      // credencial IAM para as operações `Admin*` do Cognito. Só se aplica a
      // login/register: um erro em `forgot`/`reset` é sempre falha real de
      // transporte (rede, `AUTH_UNAVAILABLE`), nunca desvio de fluxo.
      const outcome = interpretAuthError(err);
      if (outcome.needsConfirmation && (mode === 'login' || mode === 'register')) {
        goToConfirmation(email.toLowerCase().trim(), outcome.message);
      } else {
        setError(outcome.message);
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Reenvia o código. Na etapa de cadastro (`confirm`) é `/resend-code`; na
   * recuperação de senha (`reset`) é chamar `/forgot-password` de novo — o
   * Cognito reenvia o código a cada `ForgotPassword`, e não existe um
   * "resend" dedicado para essa etapa. As duas pontas mantêm a mesma cautela
   * do 204: nunca confirmam que o e-mail existe.
   */
  async function handleResend() {
    setError('');
    setNotice('');
    setResending(true);
    try {
      if (mode === 'reset') {
        await forgotPassword(pendingEmail);
        setCode('');
        setNotice('Se houver uma conta com esse e-mail, um novo código foi enviado.');
      } else {
        await resendConfirmationCode(pendingEmail);
        setCode('');
        setNotice(`Enviamos um novo código para ${pendingEmail}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setResending(false);
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirm('');
    setCode('');
    setPendingEmail('');
    setNewPassword('');
    setNewPasswordConfirm('');
  }

  const confirmBlocked = confirmDisabledReason({ code, loading });
  const forgotBlocked = forgotDisabledReason({ email: pendingEmail, loading });
  const resetBlocked = resetDisabledReason({ code, newPassword, loading });

  return (
    <div className="vw-landing-page">
      <div className="vw-landing-toggle">
        <ThemeToggleButton theme={theme} onToggle={onToggle} />
      </div>

      <div className="vw-landing-grid">
        {/* Card esquerdo: apresentação */}
        <div className="vw-landing-intro vw-card vw-rise">
          <div className="vw-landing-logo">
            <img src="/logo.png" alt="" className="vw-landing-logo-mascot" />
            <span className="vw-wordmark vw-landing-wordmark">vetor</span>
          </div>

          <h1 className="vw-landing-title">Sua vida financeira, organizada em camadas.</h1>
          <p className="vw-landing-desc">
            Renda, despesas, poupança e ações — tudo em um só lugar, com cotações em tempo real da
            B3 e lançamentos que chegam direto do seu banco.
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

          {/* T-089g — a integração bancária é o diferencial mais concreto do
              app e estava invisível para quem ainda não tem conta. As frases
              de segurança são as MESMAS do modal (`pluggySecurityNotes`), de
              propósito: promessa feita antes do cadastro e explicação dada na
              hora de conectar não podem divergir com o tempo. */}
          <section className="vw-landing-pluggy">
            <div className="vw-landing-pluggy-head">
              <span
                className="vw-pluggy-badge"
                style={{ width: 28, height: 28, background: PLUGGY_BRAND.logoBackdrop }}
              >
                <img src={PLUGGY_BRAND.logo} alt="" width={28} height={28} />
              </span>
              <div>
                <p className="vw-landing-feature-title">Conecte seu banco</p>
                <p className="vw-landing-feature-desc">
                  Open Finance via <strong>{PLUGGY_BRAND.name}</strong>
                </p>
              </div>
            </div>
            <p className="vw-landing-pluggy-desc">
              Seus lançamentos entram sozinhos, sem digitar nada — e transferências entre suas
              contas, pagamento de fatura e aplicações não viram despesa.
            </p>
            <ul className="vw-landing-pluggy-notes">
              {pluggySecurityNotes().map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        </div>

        {/* Card direito: login/cadastro */}
        <div className="vw-landing-auth vw-card vw-rise" style={{ ['--vw-rise-i' as string]: 1 }}>
          <h2 className="vw-landing-auth-title">
            {mode === 'login'
              ? 'Entrar'
              : mode === 'register'
                ? 'Criar conta'
                : mode === 'confirm'
                  ? 'Confirmar cadastro'
                  : mode === 'forgot'
                    ? 'Recuperar senha'
                    : 'Nova senha'}
          </h2>

          {error && (
            <div
              className="mb-4 text-sm text-down bg-down/10 border border-down/25 px-3 py-2"
              style={{ borderRadius: 10 }}
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              className="mb-4 text-sm text-ink bg-up/10 border border-up/25 px-3 py-2"
              style={{ borderRadius: 10 }}
            >
              {notice}
            </div>
          )}

          {mode === 'confirm' ? (
            <>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <p className="text-sm text-dim">
                  Enviamos um código de {CONFIRMATION_CODE_LENGTH} dígitos para{' '}
                  <strong className="text-ink">{pendingEmail}</strong>. Confira também a caixa de
                  spam.
                </p>

                <label className="block">
                  <span className={labelClass}>Código de confirmação</span>
                  <input
                    className={`${inputClass} text-center text-lg tracking-[0.4em]`}
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(normalizeConfirmationCode(e.target.value))}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={confirmBlocked !== null}
                  title={confirmBlocked ?? undefined}
                  className="vw-btn-primary w-full text-sm font-semibold py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-1"
                >
                  {loading ? 'Confirmando...' : 'Confirmar cadastro'}
                </button>
              </form>

              <p className="vw-landing-switch">
                Não recebeu o código?{' '}
                <button
                  type="button"
                  className="vw-landing-switch-link"
                  onClick={handleResend}
                  disabled={resending || loading}
                >
                  {resending ? 'Reenviando...' : 'Reenviar'}
                </button>
                {' · '}
                <button
                  type="button"
                  className="vw-landing-switch-link"
                  onClick={() => switchMode('login')}
                >
                  Voltar
                </button>
              </p>
            </>
          ) : mode === 'forgot' ? (
            <>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <p className="text-sm text-dim">
                  Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um código de
                  recuperação.
                </p>

                <label className="block">
                  <span className={labelClass}>E-mail</span>
                  <input
                    className={inputClass}
                    type="email"
                    value={pendingEmail}
                    onChange={(e) => setPendingEmail(e.target.value)}
                    placeholder="voce@exemplo.com"
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={forgotBlocked !== null}
                  title={forgotBlocked ?? undefined}
                  className="vw-btn-primary w-full text-sm font-semibold py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-1"
                >
                  {loading ? 'Enviando...' : 'Enviar código'}
                </button>
              </form>

              <p className="vw-landing-switch">
                <button
                  type="button"
                  className="vw-landing-switch-link"
                  onClick={() => switchMode('login')}
                >
                  Voltar
                </button>
              </p>
            </>
          ) : mode === 'reset' ? (
            <>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <p className="text-sm text-dim">
                  Se <strong className="text-ink">{pendingEmail}</strong> tiver uma conta, um código
                  de {CONFIRMATION_CODE_LENGTH} dígitos foi enviado para ele. Confira também a caixa
                  de spam.
                </p>

                <label className="block">
                  <span className={labelClass}>Código de confirmação</span>
                  <input
                    className={`${inputClass} text-center text-lg tracking-[0.4em]`}
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(normalizeConfirmationCode(e.target.value))}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>Senha nova</span>
                  <input
                    className={inputClass}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    required
                  />
                </label>

                <ul className="vw-password-rules">
                  {passwordRules(newPassword).map((rule) => (
                    <li
                      key={rule.key}
                      className={rule.ok ? 'vw-password-rule-ok' : 'vw-password-rule'}
                    >
                      <span aria-hidden="true">{rule.ok ? '✓' : '○'}</span> {rule.label}
                    </li>
                  ))}
                </ul>

                <label className="block">
                  <span className={labelClass}>Confirmar senha nova</span>
                  <input
                    className={inputClass}
                    type="password"
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={resetBlocked !== null}
                  title={resetBlocked ?? undefined}
                  className="vw-btn-primary w-full text-sm font-semibold py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-1"
                >
                  {loading ? 'Confirmando...' : 'Trocar senha'}
                </button>
              </form>

              <p className="vw-landing-switch">
                Não recebeu o código?{' '}
                <button
                  type="button"
                  className="vw-landing-switch-link"
                  onClick={handleResend}
                  disabled={resending || loading}
                >
                  {resending ? 'Reenviando...' : 'Reenviar'}
                </button>
                {' · '}
                <button
                  type="button"
                  className="vw-landing-switch-link"
                  onClick={() => switchMode('login')}
                >
                  Voltar
                </button>
              </p>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <label className="block">
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
                </label>

                <label className="block">
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
                </label>

                {mode === 'login' && (
                  <div className="vw-auth-forgot">
                    <button
                      type="button"
                      className="vw-landing-switch-link"
                      onClick={goToForgotPassword}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                )}

                {/* T-106b: a recusa do Cognito é genérica ("senha não atende à
                    política"), então a lista tem de ser visível ENQUANTO digita —
                    descobrir a regra quebrada depois do POST é o round-trip cego
                    que `passwordPolicy.ts` existe para evitar. */}
                {mode === 'register' && (
                  <ul className="vw-password-rules">
                    {passwordRules(password).map((rule) => (
                      <li
                        key={rule.key}
                        className={rule.ok ? 'vw-password-rule-ok' : 'vw-password-rule'}
                      >
                        <span aria-hidden="true">{rule.ok ? '✓' : '○'}</span> {rule.label}
                      </li>
                    ))}
                  </ul>
                )}

                {mode === 'register' && (
                  <label className="block">
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
                  </label>
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
                    <button
                      type="button"
                      className="vw-landing-switch-link"
                      onClick={() => switchMode('register')}
                    >
                      Criar conta
                    </button>
                  </>
                ) : (
                  <>
                    Já tem conta?{' '}
                    <button
                      type="button"
                      className="vw-landing-switch-link"
                      onClick={() => switchMode('login')}
                    >
                      Entrar
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      <p className="vw-landing-footer">
        Cotações via brapi.dev · Open Finance via Pluggy · identidade no AWS Cognito · seus dados
        ficam no seu servidor
      </p>
    </div>
  );
}
