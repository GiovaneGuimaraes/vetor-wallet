import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MySubscriptionResponse } from '@vetor-wallet/shared';
import { getMySubscription, updateMe, changePassword, openCustomerPortal } from '../api';
import { redirectTo } from '../navigation';
import { useShellContext } from '../layout/ShellContext';
import { BackToHomeLink } from '../components/BackToHomeLink';
import { CollapsibleSection } from '../components/CollapsibleSection';
import {
  formatPhoneForDisplay,
  normalizePhoneForSubmit,
  isValidNewPassword,
  passwordsMatch,
} from './conta';
import {
  formatPlanPrice,
  planPeriodLabel,
  subscriptionProviderLabel,
  subscriptionStatusLabel,
  subscriptionUiState,
} from './planos';
import './layers-savings.css';
import './planos.css';
import './conta.css';

const periodEndFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

function formatPeriodEnd(iso: string | null): string | null {
  if (!iso) return null;
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return periodEndFmt.format(d);
}

/**
 * Rota `/conta` (T-093): dois cards — "Meus dados" (editar name/phone via
 * `PATCH /api/auth/me`, T-092) e "Assinatura" (leitura de `getMySubscription`,
 * já usada em `/planos`). Troca de senha (T-094) fica atrás de um
 * `CollapsibleSection` dentro do card de dados, via `POST
 * /api/auth/change-password`; não afeta a sessão atual.
 */
export function ContaPage() {
  const { user, onUserUpdated } = useShellContext();

  const [name, setName] = useState(user.name ?? '');
  const [phone, setPhone] = useState(formatPhoneForDisplay(user.phone));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [sub, setSub] = useState<MySubscriptionResponse | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState<string | null>(null);
  // Instante da leitura: o rótulo compara o fim do período com ELE (render puro).
  const [subReadAtMs, setSubReadAtMs] = useState(0);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setSubError(null);
    try {
      setSub(await getMySubscription());
      setSubReadAtMs(Date.now());
    } catch (e) {
      setSubError(e instanceof Error ? e.message : 'Falha ao carregar assinatura');
    } finally {
      setSubLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const updated = await updateMe({
        name: trimmedName === '' ? null : trimmedName,
        phone: phone.trim() === '' ? null : normalizePhoneForSubmit(phone),
      });
      onUserUpdated(updated);
      setName(updated.name ?? '');
      setPhone(formatPhoneForDisplay(updated.phone));
      setSaveSuccess(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Falha ao salvar seus dados');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!isValidNewPassword(newPassword)) {
      setPasswordError('A nova senha deve ter pelo menos 8 caracteres');
      return;
    }
    if (!passwordsMatch(newPassword, confirmPassword)) {
      setPasswordError('A confirmação não coincide com a nova senha');
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Falha ao trocar a senha');
    } finally {
      setPasswordSaving(false);
    }
  }

  // Cancelar é no portal da AbacatePay (acesso segue até o fim do período pago).
  async function handleCancel() {
    setPortalError(null);
    setPortalBusy(true);
    try {
      const { url } = await openCustomerPortal();
      redirectTo(url);
    } catch (e) {
      const err = e as Error & { code?: string };
      setPortalError(
        err.code === 'PAYMENT_PROVIDER_ERROR'
          ? 'O provedor de pagamento está indisponível no momento. Tente novamente em instantes.'
          : (err.message ?? 'Falha ao abrir o portal da assinatura')
      );
      setPortalBusy(false);
    }
  }

  // Mesmo estado da `/planos` (T-124c): as duas telas não podem discordar.
  const state = sub ? subscriptionUiState(sub, subReadAtMs) : 'none';
  const providerLabel = sub?.subscription ? subscriptionProviderLabel(sub.subscription) : null;

  return (
    <div className="vw-conta">
      <BackToHomeLink />

      <div className="vw-page-header">
        <h1 className="vw-page-title">Conta</h1>
        <p className="vw-page-subtitle">Seus dados e sua assinatura</p>
      </div>

      <div className="vw-form-card">
        <p className="vw-form-title">Meus dados</p>
        <form onSubmit={handleSave}>
          <div className="vw-form-grid">
            <div className="vw-form-field">
              <label htmlFor="conta-email">E-mail</label>
              <input id="conta-email" type="email" value={user.email} readOnly disabled />
            </div>
            <div className="vw-form-field">
              <label htmlFor="conta-name">Nome</label>
              <input
                id="conta-name"
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="vw-form-field">
              <label htmlFor="conta-phone">Celular</label>
              <input
                id="conta-phone"
                type="tel"
                placeholder="(11) 98765-4321"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="vw-form-actions">
            <button type="submit" className="vw-btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          {saveError && <p className="vw-form-error">{saveError}</p>}
          {saveSuccess && !saveError && <p className="vw-conta-success">Dados atualizados.</p>}
        </form>
        <CollapsibleSection label="Alterar senha" className="vw-conta-password-section">
          <form onSubmit={handleChangePassword}>
            <div className="vw-form-grid">
              <div className="vw-form-field">
                <label htmlFor="conta-current-password">Senha atual</label>
                <input
                  id="conta-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="vw-form-field">
                <label htmlFor="conta-new-password">Nova senha</label>
                <input
                  id="conta-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="vw-form-field">
                <label htmlFor="conta-confirm-password">Confirmar nova senha</label>
                <input
                  id="conta-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="vw-form-actions">
              <button type="submit" className="vw-btn-primary" disabled={passwordSaving}>
                {passwordSaving ? 'Salvando...' : 'Alterar senha'}
              </button>
            </div>
            {passwordError && <p className="vw-form-error">{passwordError}</p>}
            {passwordSuccess && !passwordError && (
              <p className="vw-conta-success">Senha alterada.</p>
            )}
          </form>
        </CollapsibleSection>
      </div>

      <div className="vw-form-card">
        <p className="vw-form-title">Assinatura</p>

        {subLoading ? (
          <div className="vw-state-box">Carregando...</div>
        ) : subError ? (
          <div className="vw-state-box vw-state-error">{subError}</div>
        ) : sub ? (
          <>
            {!sub.billingEnabled && (
              <div className="vw-planos-banner">
                Ambiente de staging: todos os recursos liberados, nenhum pagamento necessário.
              </div>
            )}

            {sub.subscription && sub.plan ? (
              <div className="vw-conta-subscription">
                <p className="vw-conta-subscription-plan">{sub.plan.name}</p>
                <p className="vw-conta-subscription-price">
                  {formatPlanPrice(sub.plan.price_cents)}
                  <span>{planPeriodLabel(sub.plan.interval)}</span>
                </p>
                <p className="vw-conta-subscription-status">
                  Status: {subscriptionStatusLabel(state)}
                </p>
                {providerLabel && (
                  <p className="vw-conta-subscription-period">Pagamento: {providerLabel}</p>
                )}
                {sub.subscription.current_period_end && (
                  <p className="vw-conta-subscription-period">
                    {state === 'expired' || state === 'card_lapsed'
                      ? 'venceu em'
                      : state === 'canceled_with_access'
                        ? 'acesso até'
                        : 'válido até'}{' '}
                    {formatPeriodEnd(sub.subscription.current_period_end)}
                  </p>
                )}
                {(state === 'active' || state === 'payment_failed' || state === 'card_lapsed') && (
                  <div className="vw-form-actions">
                    <button
                      type="button"
                      className="vw-btn-ghost"
                      disabled={portalBusy}
                      onClick={handleCancel}
                    >
                      {portalBusy ? 'Abrindo...' : 'Cancelar assinatura'}
                    </button>
                    <p className="vw-conta-subscription-period">
                      Você continua com acesso até o fim do período já pago.
                    </p>
                    {portalError && <p className="vw-form-error">{portalError}</p>}
                  </div>
                )}
              </div>
            ) : (
              <div className="vw-conta-no-subscription">
                <p>Você ainda não tem uma assinatura ativa.</p>
                <Link to="/planos" className="vw-btn-primary vw-conta-plans-link">
                  Ver planos
                </Link>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
