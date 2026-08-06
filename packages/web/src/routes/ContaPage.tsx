import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MySubscriptionResponse, SubscriptionStatus } from '@vetor-wallet/shared';
import { getMySubscription, updateMe } from '../api';
import { useShellContext } from '../layout/ShellContext';
import { BackToHomeLink } from '../components/BackToHomeLink';
import { formatPhoneForDisplay, normalizePhoneForSubmit } from './conta';
import { formatPlanPrice, planPeriodLabel } from './planos';
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

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Ativa',
  expired: 'Vencida',
  pending: 'Pendente',
  canceled: 'Cancelada',
};

/**
 * Rota `/conta` (T-093): dois cards — "Meus dados" (editar name/phone via
 * `PATCH /api/auth/me`, T-092) e "Assinatura" (leitura de `getMySubscription`,
 * já usada em `/planos`). Troca de senha é T-094 — só o espaço reservado
 * abaixo do card de dados, sem implementação.
 */
export function ContaPage() {
  const { user, onUserUpdated } = useShellContext();

  const [name, setName] = useState(user.name ?? '');
  const [phone, setPhone] = useState(formatPhoneForDisplay(user.phone));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [sub, setSub] = useState<MySubscriptionResponse | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setSubError(null);
    try {
      setSub(await getMySubscription());
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
        {/* T-094 (fora de escopo desta tarefa): troca de senha entra aqui. */}
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
                  Status: {STATUS_LABELS[sub.subscription.status]}
                </p>
                {sub.subscription.current_period_end && (
                  <p className="vw-conta-subscription-period">
                    válido até {formatPeriodEnd(sub.subscription.current_period_end)}
                  </p>
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
