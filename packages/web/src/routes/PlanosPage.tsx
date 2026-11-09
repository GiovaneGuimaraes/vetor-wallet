import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { MySubscriptionResponse, Plan } from '@vetor-wallet/shared';
import {
  createSubscription,
  getMySubscription,
  getPlans,
  openCustomerPortal,
  syncSubscription,
} from '../api';
import { redirectTo } from '../navigation';
import {
  canSubscribe,
  checkoutReturnParam,
  CONFIRM_WINDOW_MS,
  formatPlanPrice,
  hasPaidAccess,
  monthlyEquivalentCents,
  nextPollDelayMs,
  planPeriodLabel,
  subscribeErrorMessage,
  subscriptionUiState,
  yearlySavingsPercent,
} from './planos';

const PRO_FEATURES = [
  'Layer de Ações da B3',
  'Layer de Criptomoedas',
  'Importação automática via Pluggy',
];
import './planos.css';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

function formatPeriodEnd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return dateFmt.format(d);
}

type ConfirmPhase = 'idle' | 'waiting' | 'done' | 'timeout';

/**
 * Rota `/planos`: vitrine de planos + assinatura no CARTÃO pela página
 * hospedada da AbacatePay (T-124c; o Pix de assinatura saiu).
 *
 * - "Assinar" → `POST /api/subscriptions` → redireciona para `checkout.url`.
 * - Ao abrir, SEMPRE chama `sync` uma vez (o servidor faz o throttling) — é o
 *   que conserta uma renovação/cancelamento que o app ainda não viu, inclusive
 *   para quem chega pelo redirect global do 402.
 * - Voltando com `?checkout=completed`, mostra "Confirmando pagamento…" e
 *   repete o `sync` com backoff até ~2 min ou até o acesso aparecer; depois
 *   tira o parâmetro da URL (replace, sem entrada nova no histórico).
 *
 * A lógica (estado da tela, mensagens, backoff) vive em `planos.ts`; aqui só
 * fetch/estado/efeitos.
 */
export function PlanosPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sub, setSub] = useState<MySubscriptionResponse | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [confirmPhase, setConfirmPhase] = useState<ConfirmPhase>('idle');
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  // Instante da última leitura: o estado da tela compara o fim do período com
  // ELE, não com `Date.now()` no render (render puro).
  const [subReadAtMs, setSubReadAtMs] = useState(0);
  // `sync` em andamento depois de um 409 ALREADY_SUBSCRIBED.
  const [verifying, setVerifying] = useState(false);

  const mountedRef = useRef(true);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lido UMA vez: o parâmetro some da URL quando a confirmação termina.
  const initialReturnRef = useRef(checkoutReturnParam(location.search));

  const clearReturnParam = useCallback(() => {
    if (!checkoutReturnParam(location.search)) return;
    const params = new URLSearchParams(location.search);
    params.delete('checkout');
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '' },
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  /**
   * `sync` com fallback para o `/me`: um 5xx no `sync` não pode deixar a tela
   * sem estado (o `/me` é só leitura e não depende do provedor).
   */
  const refresh = useCallback(async (): Promise<MySubscriptionResponse | null> => {
    try {
      const fresh = await syncSubscription();
      if (!mountedRef.current) return null;
      setProviderUnavailable(fresh.providerUnavailable === true);
      setSub(fresh);
      setSubReadAtMs(Date.now());
      return fresh;
    } catch {
      try {
        const me = await getMySubscription();
        if (!mountedRef.current) return null;
        setSub(me);
        setSubReadAtMs(Date.now());
        return me;
      } catch (e) {
        if (mountedRef.current) {
          setLoadError(e instanceof Error ? e.message : 'Falha ao carregar assinatura');
        }
        return null;
      }
    }
  }, []);

  /** Depois de reler: a tela ainda ofereceria "Assinar"? (sem leitura = sim, por segurança da mensagem) */
  const stillOffersSubscribe = useCallback((fresh: MySubscriptionResponse | null): boolean => {
    return !fresh || canSubscribe(subscriptionUiState(fresh, Date.now()));
  }, []);

  /** Repete o `sync` com backoff até o acesso aparecer ou a janela de ~2 min passar. */
  const startConfirming = useCallback(
    (initial: MySubscriptionResponse | null) => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      const startedAt = Date.now();
      const finish = (phase: ConfirmPhase) => {
        if (!mountedRef.current) return;
        setConfirmPhase(phase);
        clearReturnParam();
      };
      if (initial && hasPaidAccess(initial.subscription, Date.now()) && !initial.confirming) {
        finish('done');
        return;
      }
      setConfirmPhase('waiting');
      let attempt = 0;
      const tick = async () => {
        const fresh = await refresh();
        if (!mountedRef.current) return;
        if (fresh && hasPaidAccess(fresh.subscription, Date.now()) && !fresh.confirming) {
          finish('done');
          return;
        }
        attempt += 1;
        if (Date.now() - startedAt >= CONFIRM_WINDOW_MS) {
          finish('timeout');
          return;
        }
        confirmTimerRef.current = setTimeout(tick, nextPollDelayMs(attempt));
      };
      confirmTimerRef.current = setTimeout(tick, nextPollDelayMs(0));
    },
    [clearReturnParam, refresh]
  );

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      const [me, plansRes] = await Promise.all([
        refresh(),
        getPlans().then(
          (value) => ({ ok: true as const, value }),
          (reason: unknown) => ({ ok: false as const, reason })
        ),
      ]);
      if (!mountedRef.current) return;
      if (plansRes.ok) setPlans(plansRes.value);
      else {
        setLoadError(
          plansRes.reason instanceof Error ? plansRes.reason.message : 'Falha ao carregar planos'
        );
      }
      setLoading(false);

      const ret = initialReturnRef.current;
      if (ret === 'completed' || me?.confirming) startConfirming(me);
      else if (ret === 'returned') clearReturnParam();
    })();
    return () => {
      mountedRef.current = false;
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
    // Carrega uma vez por montagem; `clearReturnParam` muda junto com a URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubscribe(plan: Plan) {
    setActionError(null);
    setSubscribing(plan.id);
    try {
      const res = await createSubscription(plan.id);
      redirectTo(res.checkout.url);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'ACTIVATION_PENDING') {
        startConfirming(null);
      } else if (err.code === 'ALREADY_SUBSCRIBED') {
        // A tela achava que dava para assinar e o servidor discorda: o estado
        // local está velho (renovação/ativação não vista). Reconcilia e deixa o
        // estado novo explicar; a mensagem só fica se a tela AINDA oferecer
        // "Assinar" depois do sync.
        setVerifying(true);
        const fresh = await refresh();
        if (!mountedRef.current) return;
        setVerifying(false);
        if (stillOffersSubscribe(fresh)) {
          setActionError(subscribeErrorMessage(err.code, err.message));
        }
      } else {
        setActionError(subscribeErrorMessage(err.code, err.message));
      }
      setSubscribing(null);
    }
  }

  /** `sync` sob demanda (cartão vencido localmente); o servidor faz o throttling. */
  async function handleVerify() {
    setActionError(null);
    setVerifying(true);
    await refresh();
    if (mountedRef.current) setVerifying(false);
  }

  async function handlePortal() {
    setActionError(null);
    setPortalBusy(true);
    try {
      const { url } = await openCustomerPortal();
      redirectTo(url);
    } catch (e) {
      const err = e as Error & { code?: string };
      setActionError(
        err.code === 'PAYMENT_PROVIDER_ERROR'
          ? 'O provedor de pagamento está indisponível no momento. Tente novamente em instantes.'
          : (err.message ?? 'Falha ao abrir o portal da assinatura')
      );
      setPortalBusy(false);
    }
  }

  const header = (
    <div className="vw-page-header">
      <h1 className="vw-page-title">Planos</h1>
      <p className="vw-page-subtitle">
        O Vetor Wallet é gratuito para renda, despesas e poupança. Assine o Pro para desbloquear
        Ações da B3, Criptomoedas e importação automática via Pluggy.
      </p>
    </div>
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="vw-state-box">Carregando planos…</div>
      </div>
    );
  }

  const nowMs = subReadAtMs;
  const state = sub ? subscriptionUiState(sub, nowMs) : 'none';
  const confirmingNow = confirmPhase === 'waiting' || state === 'confirming';
  const periodEnd = formatPeriodEnd(sub?.subscription?.current_period_end);
  const planName = sub?.plan?.name ?? 'Pro';
  const pendingPlanName =
    plans.find((p) => p.id === sub?.pendingCheckout?.plan_id)?.name ?? planName;
  const offerSubscribe = canSubscribe(state) && !confirmingNow && !verifying;

  return (
    <div className="vw-planos">
      {header}

      {sub && !sub.billingEnabled && (
        <div className="vw-planos-banner">
          Ambiente de staging: todos os recursos liberados, nenhum pagamento necessário.
        </div>
      )}

      {loadError && <div className="vw-state-box vw-state-error">{loadError}</div>}

      {confirmingNow && (
        <div className="vw-planos-status" role="status">
          Confirmando pagamento…
        </div>
      )}

      {confirmPhase === 'timeout' && !confirmingNow && !hasPaidAccess(sub?.subscription, nowMs) && (
        <div className="vw-planos-status" role="status">
          Ainda não recebemos a confirmação do pagamento. Atualize a página em alguns instantes.
        </div>
      )}

      {confirmPhase === 'done' && state === 'active' && (
        <div className="vw-planos-success">Pagamento confirmado! Sua assinatura está ativa.</div>
      )}

      {!confirmingNow && state === 'active' && (
        <div className="vw-planos-status">
          <p className="vw-planos-status-text">
            <span className="vw-planos-badge vw-planos-badge--active">Ativa</span> {planName}
            {periodEnd && <> · válido até {periodEnd}</>}. Renova automaticamente no cartão.
          </p>
          <button
            type="button"
            className="vw-btn-ghost"
            disabled={portalBusy}
            onClick={handlePortal}
          >
            Gerenciar assinatura
          </button>
        </div>
      )}

      {!confirmingNow && state === 'payment_failed' && (
        <div className="vw-planos-status vw-planos-status--warn">
          <p className="vw-planos-status-text">
            Não conseguimos cobrar o seu cartão. Atualize o cartão para não perder o acesso
            {periodEnd && <> (válido até {periodEnd})</>}.
          </p>
          <button
            type="button"
            className="vw-btn-primary"
            disabled={portalBusy}
            onClick={handlePortal}
          >
            Atualizar cartão
          </button>
        </div>
      )}

      {!confirmingNow && state === 'canceled_with_access' && (
        <div className="vw-planos-status">
          <p className="vw-planos-status-text">
            Assinatura cancelada. Você tem acesso ao {planName}
            {periodEnd ? <> até {periodEnd}</> : null}; ela não será renovada.
          </p>
        </div>
      )}

      {!confirmingNow && state === 'legacy_pix' && (
        <div className="vw-planos-status">
          <p className="vw-planos-status-text">
            Sua assinatura via Pix vale{periodEnd && <> até {periodEnd}</>} e não renova. Depois
            dessa data você poderá assinar no cartão de crédito.
          </p>
        </div>
      )}

      {verifying && (
        <div className="vw-planos-status" role="status">
          Verificando sua assinatura…
        </div>
      )}

      {!confirmingNow && !verifying && state === 'card_lapsed' && (
        <div className="vw-planos-status vw-planos-status--warn">
          <p className="vw-planos-status-text">
            Ainda não confirmamos a renovação da sua assinatura no cartão
            {periodEnd && <> (o período venceu em {periodEnd})</>}. Se a cobrança passou, ela
            aparece aqui em instantes; se o cartão foi recusado, atualize-o no portal.
          </p>
          <button type="button" className="vw-btn-ghost" onClick={handleVerify}>
            Verificar de novo
          </button>
          <button
            type="button"
            className="vw-btn-primary"
            disabled={portalBusy}
            onClick={handlePortal}
          >
            Gerenciar assinatura
          </button>
        </div>
      )}

      {!confirmingNow && state === 'expired' && (
        <div className="vw-planos-status">
          <p className="vw-planos-status-text">
            <span className="vw-planos-badge vw-planos-badge--expired">Vencida</span> Sua assinatura{' '}
            {periodEnd ? <>venceu em {periodEnd}</> : 'venceu'}. Assine de novo para voltar a usar
            os recursos Pro.
          </p>
        </div>
      )}

      {!confirmingNow && state === 'pending_checkout' && sub?.pendingCheckout && (
        <div className="vw-planos-status">
          <p className="vw-planos-status-text">
            <span className="vw-planos-badge vw-planos-badge--pending">Aguardando pagamento</span>{' '}
            Você tem um pagamento em aberto do {pendingPlanName}.
          </p>
          <button
            type="button"
            className="vw-btn-primary"
            onClick={() => redirectTo(sub.pendingCheckout!.url)}
          >
            Continuar pagamento
          </button>
        </div>
      )}

      {providerUnavailable && !confirmingNow && (
        <p className="vw-planos-hint">
          Não foi possível consultar o provedor de pagamento agora; o estado pode estar defasado.
        </p>
      )}

      {actionError && <div className="vw-state-box vw-state-error">{actionError}</div>}

      <div className="vw-planos-grid">
        {plans.map((plan) => {
          const isYearly = plan.interval === 'yearly';
          const monthlyPlan = plans.find((p) => p.interval === 'monthly');
          const savingsPercent = isYearly ? yearlySavingsPercent(plan, monthlyPlan) : null;
          return (
            <div
              key={plan.id}
              className={`vw-planos-card${isYearly ? ' vw-planos-card--highlight' : ''}`}
            >
              {savingsPercent != null && savingsPercent > 0 && (
                <span className="vw-planos-card-savings">Economize {savingsPercent}%</span>
              )}
              <h3 className="vw-planos-card-name">{plan.name}</h3>
              <p className="vw-planos-card-price">
                {formatPlanPrice(plan.price_cents)}
                <span className="vw-planos-card-period">{planPeriodLabel(plan.interval)}</span>
              </p>
              {isYearly && (
                <p className="vw-planos-card-equivalent">
                  equivale a {formatPlanPrice(monthlyEquivalentCents(plan))}/mês
                </p>
              )}
              {plan.description && <p className="vw-planos-card-desc">{plan.description}</p>}
              <ul className="vw-planos-card-features">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature} className="vw-planos-card-feature">
                    <span className="vw-planos-card-check" aria-hidden="true">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
              {offerSubscribe && (
                <button
                  type="button"
                  className="vw-btn-primary vw-planos-card-btn"
                  disabled={subscribing !== null}
                  onClick={() => handleSubscribe(plan)}
                >
                  {subscribing === plan.id ? 'Abrindo pagamento…' : 'Assinar'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {offerSubscribe && (
        <p className="vw-planos-hint">
          Pagamento recorrente no cartão de crédito, em página segura da AbacatePay. Cancele quando
          quiser pelo portal da assinatura: o acesso segue até o fim do período pago.
        </p>
      )}
    </div>
  );
}
