import { useCallback, useEffect, useRef, useState } from 'react';
import type { MySubscriptionResponse, Plan, PixCharge } from '@vetor-wallet/shared';
import {
  createSubscription,
  getMySubscription,
  getPixCharge,
  getPlans,
  simulatePixPayment,
} from '../api';
import {
  chargeUiState,
  formatCountdown,
  formatPlanPrice,
  monthlyEquivalentCents,
  nextPollDelayMs,
  planBadge,
  planPeriodLabel,
  qrCodeDataUrl,
  remainingSeconds,
  shouldKeepPolling,
} from './planos';
import './planos.css';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

function formatPeriodEnd(iso: string | null): string | null {
  if (!iso) return null;
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return dateFmt.format(d);
}

/**
 * Rota `/planos` (T-072): vitrine de planos + assinatura via Pix. Lógica
 * testável (formatação, estado de expiração, backoff de polling) vive em
 * `planos.ts` — este componente só orquestra fetch/estado/efeitos.
 */
export function PlanosPage() {
  const [sub, setSub] = useState<MySubscriptionResponse | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [subscribing, setSubscribing] = useState<number | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [paidJustNow, setPaidJustNow] = useState(false);

  const pollAttemptRef = useRef(0);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoadError(null);
    const [subRes, plansRes] = await Promise.allSettled([getMySubscription(), getPlans()]);
    if (subRes.status === 'fulfilled') {
      setSub(subRes.value);
      setCharge(subRes.value.pendingCharge);
    } else {
      setLoadError(subRes.reason instanceof Error ? subRes.reason.message : 'Falha ao carregar assinatura');
    }
    if (plansRes.status === 'fulfilled') {
      setPlans(plansRes.value);
    } else if (subRes.status === 'fulfilled') {
      setLoadError(plansRes.reason instanceof Error ? plansRes.reason.message : 'Falha ao carregar planos');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [load]);

  // Relógio do painel Pix (contagem regressiva) — 1x por segundo, só enquanto
  // houver uma cobrança para mostrar.
  useEffect(() => {
    if (!charge) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [charge]);

  const state = chargeUiState(charge, nowMs);

  // Polling recursivo com setTimeout (backoff via nextPollDelayMs), cancelado
  // no unmount e assim que sai de 'awaiting'.
  useEffect(() => {
    if (!charge || !shouldKeepPolling(state)) return;

    let cancelled = false;
    pollAttemptRef.current = 0;

    async function tick() {
      if (cancelled || !charge) return;
      try {
        const fresh = await getPixCharge(charge.id);
        if (cancelled || !mountedRef.current) return;
        setCharge(fresh);
        if (fresh.status === 'PAID') {
          setPaidJustNow(true);
          const meAfterPaid = await getMySubscription();
          if (!cancelled && mountedRef.current) setSub(meAfterPaid);
          return;
        }
        if (!shouldKeepPolling(chargeUiState(fresh, Date.now()))) return;
      } catch {
        /* blip de rede: tenta de novo no próximo tick */
      }
      pollAttemptRef.current += 1;
      pollTimeoutRef.current = setTimeout(tick, nextPollDelayMs(pollAttemptRef.current));
    }

    pollTimeoutRef.current = setTimeout(tick, nextPollDelayMs(0));

    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge?.id, state]);

  async function handleSubscribe(plan: Plan) {
    setSubscribeError(null);
    setSubscribing(plan.id);
    setPaidJustNow(false);
    try {
      const res = await createSubscription(plan.id);
      setCharge(res.charge);
      setSub((prev) => (prev ? { ...prev, subscription: res.subscription } : prev));
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'ALREADY_SUBSCRIBED') {
        setSubscribeError('Você já tem uma assinatura ativa.');
      } else if (err.code === 'BILLING_NOT_CONFIGURED') {
        setSubscribeError('Pagamento ainda não está configurado neste ambiente.');
      } else if (err.code === 'PAYMENT_PROVIDER_ERROR') {
        setSubscribeError('O provedor de pagamento está indisponível no momento. Tente novamente em instantes.');
      } else {
        setSubscribeError(err.message ?? 'Falha ao assinar o plano');
      }
    } finally {
      setSubscribing(null);
    }
  }

  async function handleCopy() {
    if (!charge) return;
    try {
      await navigator.clipboard.writeText(charge.br_code);
    } catch {
      // Fallback: seleciona o texto para o usuário copiar manualmente.
      const el = document.getElementById('vw-pix-brcode') as HTMLTextAreaElement | null;
      el?.select();
    }
  }

  async function handleSimulate() {
    if (!charge) return;
    try {
      const fresh = await simulatePixPayment(charge.id);
      setCharge(fresh);
      if (fresh.status === 'PAID') {
        setPaidJustNow(true);
        setSub(await getMySubscription());
      }
    } catch {
      /* dev-only: falha aqui não precisa de tratamento fino */
    }
  }

  if (loading) {
    return (
      <div>
        <div className="vw-page-header">
          <h1 className="vw-page-title">Planos</h1>
          <p className="vw-page-subtitle">Assine para liberar todos os recursos</p>
        </div>
        <div className="vw-state-box">Carregando planos…</div>
      </div>
    );
  }

  const badge = sub ? planBadge(sub, nowMs) : 'none';
  const seconds = remainingSeconds(charge?.expires_at ?? null, nowMs);

  return (
    <div className="vw-planos">
      <div className="vw-page-header">
        <h1 className="vw-page-title">Planos</h1>
        <p className="vw-page-subtitle">Assine para liberar todos os recursos</p>
      </div>

      {sub && !sub.billingEnabled && (
        <div className="vw-planos-banner">
          Ambiente de staging: todos os recursos liberados, nenhum pagamento necessário.
        </div>
      )}

      {loadError && <div className="vw-state-box vw-state-error">{loadError}</div>}

      {sub?.subscription && sub.plan && (
        <div className="vw-planos-current">
          <span className={`vw-planos-badge vw-planos-badge--${badge}`}>
            {badge === 'active' && 'Ativa'}
            {badge === 'expired' && 'Vencida'}
            {badge === 'pending' && 'Aguardando pagamento'}
            {badge === 'staging' && 'Staging'}
            {badge === 'none' && 'Sem assinatura'}
          </span>
          <span className="vw-planos-current-plan">{sub.plan.name}</span>
          {sub.subscription.current_period_end && (
            <span className="vw-planos-current-until">
              válido até {formatPeriodEnd(sub.subscription.current_period_end)}
            </span>
          )}
        </div>
      )}

      {paidJustNow && state === 'paid' && (
        <div className="vw-planos-success">Pagamento confirmado! Sua assinatura está ativa.</div>
      )}

      {charge && state !== 'idle' && state !== 'paid' && (
        <div className="vw-planos-pix">
          <h2 className="vw-planos-pix-title">Pagamento via Pix</h2>
          <img
            src={qrCodeDataUrl(charge.br_code_base64)}
            alt="QR Code Pix"
            className="vw-planos-pix-qr"
          />
          <label htmlFor="vw-pix-brcode" className="vw-planos-pix-label">
            Pix copia e cola
          </label>
          <div className="vw-planos-pix-copyrow">
            <textarea id="vw-pix-brcode" readOnly value={charge.br_code} className="vw-planos-pix-code" />
            <button type="button" className="vw-btn-ghost" onClick={handleCopy}>
              Copiar
            </button>
          </div>
          {seconds !== null && (
            <p className="vw-planos-pix-countdown">
              {state === 'expired' ? 'Cobrança expirada' : `Expira em ${formatCountdown(seconds)}`}
            </p>
          )}
          {state === 'expired' && (
            <p className="vw-planos-pix-hint">Assine novamente para gerar um novo QR Code.</p>
          )}
          {import.meta.env.DEV && state === 'awaiting' && (
            <button type="button" className="vw-btn-primary" onClick={handleSimulate}>
              Simular pagamento
            </button>
          )}
        </div>
      )}

      {subscribeError && <div className="vw-state-box vw-state-error">{subscribeError}</div>}

      <div className="vw-planos-grid">
        {plans.map((plan) => (
          <div key={plan.id} className="vw-planos-card">
            <h3 className="vw-planos-card-name">{plan.name}</h3>
            <p className="vw-planos-card-desc">{plan.description}</p>
            <p className="vw-planos-card-price">
              {formatPlanPrice(plan.price_cents)}
              <span className="vw-planos-card-period">{planPeriodLabel(plan.interval)}</span>
            </p>
            {plan.interval === 'yearly' && (
              <p className="vw-planos-card-equivalent">
                equivale a {formatPlanPrice(monthlyEquivalentCents(plan))}/mês
              </p>
            )}
            <button
              type="button"
              className="vw-btn-primary vw-planos-card-btn"
              disabled={subscribing === plan.id}
              onClick={() => handleSubscribe(plan)}
            >
              {subscribing === plan.id ? 'Assinando…' : 'Assinar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
