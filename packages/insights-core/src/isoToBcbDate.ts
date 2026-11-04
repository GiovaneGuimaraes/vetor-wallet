/** `YYYY-MM-DD` → `dd/mm/yyyy`, o formato que a API do BCB espera. */
export function isoToBcbDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
