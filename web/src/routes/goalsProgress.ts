import type { Goal } from '@vetor-wallet/shared';

/**
 * Helpers puros da tela de Metas (T-024) — extraídos do componente para
 * poderem ser testados sem DOM.
 */

/** Percentual bruto (pode passar de 100 quando a meta é superada). */
export function progressPct(goal: Goal): number {
  if (goal.target_amount <= 0) return 0;
  return (goal.current_amount / goal.target_amount) * 100;
}

/** Percentual limitado a 0–100 para a largura da barra. */
export function progressPctClamped(goal: Goal): number {
  return Math.min(100, Math.max(0, progressPct(goal)));
}

/**
 * true quando o progresso vem dos lançamentos de poupança vinculados — nesse
 * caso o valor atual não é editável (o server rejeita o PATCH com 400).
 * Metas antigas/sem vínculo (`progress_source` ausente) seguem manuais.
 */
export function isDerivedProgress(goal: Goal): boolean {
  return goal.progress_source === 'LINKED_SAVINGS';
}

/** Texto explicativo da origem do progresso, em pt-BR. */
export function progressSourceLabel(goal: Goal): string {
  if (!isDerivedProgress(goal)) return 'Progresso manual';
  const count = goal.linked_entries_count ?? 0;
  return count === 1
    ? 'Progresso automático · 1 lançamento vinculado'
    : `Progresso automático · ${count} lançamentos vinculados`;
}
