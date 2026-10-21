import type { PluggyInvestment } from './toPluggyInvestment';

/** Rótulo de quem veio sem `type` — contado, nunca descartado. */
export const UNTYPED_INVESTMENT_LABEL = '(sem tipo)';

export interface PluggyInvestmentsSummary {
  total: number;
  /** Contagem por `type` como veio da Pluggy, em ordem alfabética de chave. */
  byType: Record<string, number>;
}

/**
 * Resumo **só de estrutura** de uma lista de investimentos (T-091d, fatia d1):
 * quantos são e quantos de cada `type`. É o que o `pluggy:investments` imprime.
 *
 * Mora aqui, e não no cli, para a garantia "nada de valor, nome, código ou id
 * sai daqui" ter teste: o retorno só carrega contagens e os rótulos de `type`
 * (vocabulário da Pluggy, não dado do usuário). Saída de terminal acaba em
 * print, `BACKLOG.md` e Discord, e o repo é público.
 */
export function summarizePluggyInvestments(
  investments: readonly PluggyInvestment[]
): PluggyInvestmentsSummary {
  const counts = new Map<string, number>();
  for (const inv of investments) {
    const key = inv.type ?? UNTYPED_INVESTMENT_LABEL;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const byType: Record<string, number> = {};
  for (const key of [...counts.keys()].sort()) byType[key] = counts.get(key)!;
  return { total: investments.length, byType };
}
