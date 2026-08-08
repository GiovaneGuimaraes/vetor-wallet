/** true quando o billing está ligado por env — a UI usa isso para esconder a oferta. */
export const isBillingEnabled = (): boolean => {
  return (process.env.BILLING_ENABLED ?? '').trim() === 'true';
};
