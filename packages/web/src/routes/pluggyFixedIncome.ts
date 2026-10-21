import type { PluggyFixedIncomePosition, PluggyFixedIncomeResponse } from '@vetor-wallet/shared';

/**
 * Helpers puros da Renda Fixa vinda da conexão bancária (Pluggy, T-091d
 * fatia d2). Sem React, sem I/O — mesma convenção de `fixedIncome.ts`.
 *
 * A posição da Pluggy é **lida ao vivo** a cada acesso e nunca é gravada
 * (decisão do humano, 2026-10-21). Ela convive com a RF lançada à mão: as duas
 * fontes **somam**, e a tela tem de deixar claro qual é qual — por isso o
 * vocabulário fixo abaixo. Nada aqui casa itens automaticamente: o vínculo
 * explícito manual↔conexão (e quem sai do total por causa dele) está em
 * `fixedIncomeLinks.ts` (fatia d3b).
 */

/** Rótulo da fonte Pluggy na tela. Mudar aqui muda nas duas páginas. */
export const PLUGGY_SOURCE_LABEL = 'Da sua conexão bancária';
/** Rótulo da fonte manual na tela. */
export const MANUAL_SOURCE_LABEL = 'Lançada por você';

export type PluggyFixedIncomeView =
  /** Carregando, integração desligada ou usuário sem conexão: a tela fica como antes. */
  | { kind: 'hidden' }
  /** A chamada inteira falhou: a RF manual segue, a parte da conexão vira aviso. */
  | { kind: 'error' }
  | {
      kind: 'ready';
      /** Ordenadas por vencimento, sem vencimento no fim. */
      positions: PluggyFixedIncomePosition[];
      /** Soma dos saldos informados pela conexão, em centavos inteiros. */
      totalCents: number;
      /** Posições sem saldo informado — não entram na soma (nunca viram 0). */
      withoutValue: number;
      /** Conexões que não responderam agora; o total pode estar incompleto. */
      failedConnections: number;
    };

/**
 * Decide o que a tela mostra da conexão bancária. `response` `null` com
 * `failed` falso = ainda carregando.
 */
export function pluggyFixedIncomeView(
  response: PluggyFixedIncomeResponse | null,
  failed: boolean
): PluggyFixedIncomeView {
  if (failed) return { kind: 'error' };
  if (response === null || !response.enabled || response.connections === 0) {
    return { kind: 'hidden' };
  }
  return {
    kind: 'ready',
    positions: sortPluggyByMaturity(response.positions),
    totalCents: pluggyTotalCents(response.positions),
    withoutValue: response.positions.filter((p) => p.currentValue === null).length,
    failedConnections: response.failedConnections,
  };
}

/** Soma de `currentValue` em centavos inteiros; posição sem saldo é pulada. */
export function pluggyTotalCents(positions: readonly PluggyFixedIncomePosition[]): number {
  return positions.reduce(
    (sum, p) => (p.currentValue === null ? sum : sum + Math.round(p.currentValue * 100)),
    0
  );
}

/** Centavos da conexão que entram num total consolidado (0 fora do estado `ready`). */
export function pluggyCentsForTotal(view: PluggyFixedIncomeView): number {
  return view.kind === 'ready' ? view.totalCents : 0;
}

/** Vencimento mais próximo primeiro; sem vencimento no fim; ordem estável. */
export function sortPluggyByMaturity(
  positions: readonly PluggyFixedIncomePosition[]
): PluggyFixedIncomePosition[] {
  return positions
    .map((position, index) => ({ position, index }))
    .sort((a, b) => {
      const am = a.position.maturityDate;
      const bm = b.position.maturityDate;
      if (am !== bm) {
        if (am === null) return 1;
        if (bm === null) return -1;
        return am < bm ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map(({ position }) => position);
}

/** Título da linha: nome, senão o subtipo, senão um rótulo neutro — nunca vazio. */
export function pluggyPositionTitle(position: PluggyFixedIncomePosition): string {
  const base = position.name ?? position.subtype ?? 'Investimento de renda fixa';
  return position.institution ? `${base} · ${position.institution}` : base;
}

/**
 * Taxa como veio da Pluggy, **sem interpretar**: o significado de `rate` por
 * `rateType` não é documentado lá, e "110% do CDI" × "CDI + 1,1%" é a
 * diferença entre informação e dado errado. `null` quando não há taxa.
 */
export function pluggyRateText(position: PluggyFixedIncomePosition): string | null {
  if (position.rate === null) return null;
  const n = String(Math.round(position.rate * 100) / 100).replace('.', ',');
  return position.rateType ? `Taxa ${n} (${position.rateType})` : `Taxa ${n}`;
}

/** Aviso de conexões que falharam agora; `null` se nenhuma. */
export function pluggyFailureNote(failedConnections: number): string | null {
  if (failedConnections <= 0) return null;
  return failedConnections === 1
    ? '1 conexão bancária não respondeu agora — o total dela pode estar incompleto.'
    : `${failedConnections} conexões bancárias não responderam agora — o total delas pode estar incompleto.`;
}
