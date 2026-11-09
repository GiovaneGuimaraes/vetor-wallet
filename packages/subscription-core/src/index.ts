export { addInterval } from './addInterval';
export { getActivePlan, getActivePlanText } from './getActivePlan';
export { getSubscriptionRow, getSubscriptionRowText } from './getSubscriptionRow';
export { isBillingEnabled } from './isBillingEnabled';
export { isSubscriptionActive } from './isSubscriptionActive';
export { type ActivationResult, markChargePaidAndActivate } from './markChargePaidAndActivate';
export { nowSqliteUtc } from './nowSqliteUtc';
export { parseInstant } from './parseInstant';
export { type PlanRow, toPlan } from './Plan';
export { renewalBase } from './renewalBase';
export { safeEqual } from './safeEqual';
export { type SubscriptionRow, toSubscription } from './Subscription';
export { toSqliteUtc } from './toSqliteUtc';
export { toSqliteUtcFromProvider } from './toSqliteUtcFromProvider';

// Provider AbacatePay — detalhe de implementação da assinatura, não um módulo à
// parte. Ver `src/providers/abacatepay/` e o CLAUDE.md do package. O client do
// Pix de assinatura saiu na T-124c (só cartão recorrente).
export { AbacatePayError } from './providers/abacatepay/AbacatePayError';
export { isAbacatePayConfigured } from './providers/abacatepay/isAbacatePayConfigured';
export {
  ABACATEPAY_DEFAULT_URL,
  ABACATEPAY_TIMEOUT_MS,
  abacatePayRequest,
} from './providers/abacatepay/request';

// Assinatura recorrente no cartão (T-124a): o client do provedor.
export {
  type AbacateProduct,
  type RawAbacateProduct,
  toAbacateProduct,
} from './providers/abacatepay/AbacateProduct';
export {
  type AbacateSubscription,
  type AbacateSubscriptionStatus,
  type RawAbacateSubscription,
  toAbacateSubscription,
} from './providers/abacatepay/AbacateSubscription';
export { archiveProduct } from './providers/abacatepay/archiveProduct';
export { cancelSubscription } from './providers/abacatepay/cancelSubscription';
export { createCustomer, type CreateCustomerInput } from './providers/abacatepay/createCustomer';
export {
  createCustomerPortal,
  type CreateCustomerPortalInput,
} from './providers/abacatepay/createCustomerPortal';
export { createProduct, type CreateProductInput } from './providers/abacatepay/createProduct';
export {
  type AbacateSubscriptionCheckout,
  createSubscriptionCheckout,
  type CreateSubscriptionCheckoutInput,
} from './providers/abacatepay/createSubscriptionCheckout';
export { getProductByExternalId } from './providers/abacatepay/getProductByExternalId';
export { getSubscription } from './providers/abacatepay/getSubscription';
export { listSubscriptionsByCheckout } from './providers/abacatepay/listSubscriptionsByCheckout';
export { type AbacateCycle, toAbacateCycle } from './providers/abacatepay/toAbacateCycle';

export { deleteSubscriptionCheckout } from './providers/abacatepay/deleteSubscriptionCheckout';
export { isEmptySuccess } from './providers/abacatepay/isEmptySuccess';

// Assinatura recorrente no cartão (T-124b1): a REGRA. A porta única é
// `applyProviderSubscriptionState`; ninguém mais grava ativação/renovação/
// cancelamento de cartão.
export { ActivationPendingError } from './ActivationPendingError';
export { AlreadySubscribedError } from './AlreadySubscribedError';
export {
  type ApplyReason,
  type ApplyResult,
  applyProviderSubscriptionState,
  MAX_ACTIVATION_ATTEMPTS,
  RENEWAL_WINDOW_DAYS,
  selectUserSubscriptionText,
  type SubscriptionRef,
  type SubscriptionSnapshot,
  type SubscriptionTransition,
} from './applyProviderSubscriptionState';
export { assertCanStartCheckout } from './assertCanStartCheckout';
export {
  billingCustomerName,
  FALLBACK_CUSTOMER_NAME,
  MAX_CUSTOMER_NAME_LENGTH,
} from './billingCustomerName';
export { CheckoutInProgressError } from './CheckoutInProgressError';
export { ensureBillingCustomer, type EnsureBillingCustomerResult } from './ensureBillingCustomer';
export { type CardPlanRow, ensurePlanProduct } from './ensurePlanProduct';
export {
  type CompletedCheckoutRow,
  getLatestCompletedCheckout,
} from './getLatestCompletedCheckout';
export { getBillingCustomer } from './getBillingCustomer';
export { getLatestCheckout } from './getLatestCheckout';
export { getOpenCheckout, type OpenCheckoutRow } from './getOpenCheckout';
export { isActivationPending } from './isActivationPending';
export { ProductArchivedError } from './ProductArchivedError';
export { ProductPriceMismatchError } from './ProductPriceMismatchError';
export {
  reconcileCardSubscription,
  type ReconcileResult,
  SYNC_INTERVAL_IDLE_SECONDS,
  SYNC_INTERVAL_OPEN_SECONDS,
} from './reconcileCardSubscription';
export {
  STALE_CREATING_MS,
  startCardCheckout,
  type StartCardCheckoutResult,
} from './startCardCheckout';

// Assinatura do webhook (T-123).
export {
  verifyWebhookSignature,
  type VerifyWebhookSignatureInput,
  type WebhookSignatureScheme,
} from './providers/abacatepay/verifyWebhookSignature';
export { ABACATEPAY_WEBHOOK_PUBLIC_KEY } from './providers/abacatepay/webhookPublicKey';
