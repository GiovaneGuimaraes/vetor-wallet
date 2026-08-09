/**
 * Parse do query param `?days=` de janela de histórico, compartilhado por
 * `GET /api/portfolio/history` (T-058a) e `GET /api/benchmarks/history`
 * (T-068) — as duas rotas precisam da MESMA regra, então ela mora em um lugar
 * só em vez de ser reescrita por rota.
 *
 * Mesmo padrão do `?months=` de `/api/expense-entries/summary`: só inteiro
 * decimal — `1.5`, `-1`, `abc`, ` 5` e valores repetidos (array) caem como
 * inválidos ANTES da checagem de faixa. `undefined` devolve `defaultDays`
 * (param ausente é o caso normal, não um erro).
 *
 * Devolve `null` quando o valor é inválido ou fora da faixa `[1, maxDays]` —
 * a mensagem de erro fica com a rota, que sabe o próprio texto.
 */
export function parseDaysParam(raw: unknown, defaultDays: number, maxDays: number): number | null {
  if (raw === undefined) return defaultDays;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const days = Number(raw);
  if (days < 1 || days > maxDays) return null;
  return days;
}
