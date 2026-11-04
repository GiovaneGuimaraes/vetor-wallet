/** `dd/mm/yyyy` (BCB) → `YYYY-MM-DD`; `null` para qualquer outro formato. */
export function bcbDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}
