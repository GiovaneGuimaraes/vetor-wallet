/** true quando há credencial configurada — sem ela o billing fica indisponível. */
export const isAbacatePayConfigured = (): boolean => {
  return (process.env.ABACATEPAY_API_KEY ?? '').trim().length > 0;
};
