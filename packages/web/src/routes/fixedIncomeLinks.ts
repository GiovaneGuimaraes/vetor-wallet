import type {
  FixedIncomePosition,
  FixedIncomeSummary,
  PluggyFixedIncomePosition,
  PluggyFixedIncomeResponse,
} from '@vetor-wallet/shared';
import { displayValue } from './fixedIncome';
import { pluggyCentsForTotal, pluggyFixedIncomeView } from './pluggyFixedIncome';

/**
 * Vínculo manual↔Pluggy na tela (T-091d, fatia d3b). Sem React, sem I/O —
 * mesma convenção de `fixedIncome.ts`/`pluggyFixedIncome.ts`.
 *
 * O vínculo é EXPLÍCITO (decisão do humano, spike da d3): o usuário escolhe,
 * numa lista ordenada por semelhança (`rankLinkCandidates`), qual investimento
 * da conexão é "o mesmo" que a posição lançada à mão. Nada vem pré-marcado e
 * nada é aplicado sem confirmação — isso é da tela; aqui só a ordem.
 *
 * A regra central (`resolveManualLinks`): a posição manual vinculada SAI do
 * total só quando o investimento apontado está na leitura ao vivo E tem saldo.
 * Em qualquer outro caso ela volta a contar, com o motivo — vínculo órfão
 * nunca é limpo sozinho (só pelo botão "Desvincular", edição ou exclusão).
 */

export type ManualLinkInactiveReason =
  /** A leitura da conexão ainda não terminou. */
  | 'pending'
  /** Integração desligada neste ambiente, ou o usuário não tem conexão. */
  | 'unavailable'
  /** A leitura falhou inteira, ou o investimento sumiu junto de uma conexão que não respondeu. */
  | 'connection-failed'
  /** Todas as conexões responderam e o investimento não está entre elas. */
  | 'not-found'
  /** Está na conexão, mas sem saldo informado — não dá para substituir por nada. */
  | 'no-value';

export type ManualLinkState =
  | { kind: 'unlinked' }
  | { kind: 'active'; pluggy: PluggyFixedIncomePosition }
  | { kind: 'inactive'; reason: ManualLinkInactiveReason };

export interface ManualLinksResolution {
  /** Chave = `id` da posição manual. Toda posição recebida tem uma entrada. */
  states: Map<number, ManualLinkState>;
  /** Soma (centavos) do valor exibido das posições que CONTAM — tudo menos `active`. */
  manualCentsCounted: number;
  /** Soma (centavos) das posições `active` — cobertas pela conexão, fora do total. */
  coveredManualCents: number;
  /** Posições manuais com vínculo (qualquer estado), por id da Pluggy — N→1 é possível. */
  linkedByPluggyId: Map<string, FixedIncomePosition[]>;
}

/**
 * Resolve o estado de vínculo de cada posição manual contra a leitura ao vivo
 * da conexão. Recebe a MESMA leitura que as páginas já guardam para
 * `pluggyFixedIncomeView` (`response` + `failed`; `response` `null` sem falha =
 * carregando) — não a `PluggyFixedIncomeView`, porque o `hidden` dela junta
 * "carregando" com "desligada/sem conexão", e aqui os dois motivos são
 * diferentes para quem lê.
 */
export function resolveManualLinks(
  positions: readonly FixedIncomePosition[],
  response: PluggyFixedIncomeResponse | null,
  failed: boolean
): ManualLinksResolution {
  const states = new Map<number, ManualLinkState>();
  const linkedByPluggyId = new Map<string, FixedIncomePosition[]>();
  let manualCentsCounted = 0;
  let coveredManualCents = 0;

  for (const position of positions) {
    const cents = Math.round(displayValue(position) * 100);
    const targetId = position.superseded_by_pluggy_investment_id;

    if (targetId === null) {
      states.set(position.id, { kind: 'unlinked' });
      manualCentsCounted += cents;
      continue;
    }

    const linked = linkedByPluggyId.get(targetId);
    if (linked) linked.push(position);
    else linkedByPluggyId.set(targetId, [position]);

    const state = linkState(targetId, response, failed);
    states.set(position.id, state);
    if (state.kind === 'active') coveredManualCents += cents;
    else manualCentsCounted += cents;
  }

  return { states, manualCentsCounted, coveredManualCents, linkedByPluggyId };
}

function linkState(
  targetId: string,
  response: PluggyFixedIncomeResponse | null,
  failed: boolean
): ManualLinkState {
  if (failed) return { kind: 'inactive', reason: 'connection-failed' };
  if (response === null) return { kind: 'inactive', reason: 'pending' };
  if (!response.enabled || response.connections === 0) {
    return { kind: 'inactive', reason: 'unavailable' };
  }
  const pluggy = response.positions.find((p) => p.id === targetId);
  if (!pluggy) {
    // Com alguma conexão fora do ar, "não achei" pode ser só ela não ter
    // respondido — não afirmar que o investimento sumiu.
    return {
      kind: 'inactive',
      reason: response.failedConnections > 0 ? 'connection-failed' : 'not-found',
    };
  }
  if (pluggy.currentValue === null) return { kind: 'inactive', reason: 'no-value' };
  return { kind: 'active', pluggy };
}

/** Texto curto, sem alarme, de por que a posição vinculada voltou a contar. */
export const LINK_INACTIVE_REASON_TEXT: Record<ManualLinkInactiveReason, string> = {
  pending: 'Vinculada à conexão — lendo a conexão agora; enquanto isso, conta no total.',
  unavailable:
    'Vinculada à conexão, mas a conexão bancária não está disponível agora — esta posição volta a contar no total.',
  'connection-failed':
    'Vinculada à conexão, mas não foi possível lê-la agora — esta posição volta a contar no total.',
  'not-found':
    'Vinculada a um investimento que não aparece mais na sua conexão — esta posição volta a contar no total.',
  'no-value':
    'Vinculada a um investimento sem saldo informado pela conexão — esta posição volta a contar no total.',
};

/** Selo da posição manual coberta pela conexão. */
export const LINK_ACTIVE_BADGE = 'Coberta pela conexão · fora do total';

/** Selo da linha da Pluggy que tem posição(ões) manual(is) apontando para ela. */
export function pluggyLinkedBadge(
  linked: readonly FixedIncomePosition[] | undefined
): string | null {
  if (!linked || linked.length === 0) return null;
  if (linked.length === 1) return `Vinculada a "${linked[0].name}"`;
  return `Vinculada a ${linked.length} posições suas`;
}

/**
 * Candidatos a vínculo de uma posição manual, do mais parecido ao menos.
 * Critérios, nesta ordem: (1) mesmo vencimento (os dois sem vencimento também
 * conta); (2) menor diferença relativa entre o valor exibido da manual e o
 * saldo da conexão (`currentValue ?? investedAmount`; sem nenhum dos dois vai
 * para o fim); (3) `subtype` da Pluggy contendo o `kind` da manual, como
 * substring e sem mapear os enums; empate final pela ordem recebida.
 *
 * É SÓ ordem: nenhum candidato é escondido por ser pouco parecido. A única
 * exclusão é `id: null` — sem id não há ponteiro útil para gravar.
 */
export function rankLinkCandidates(
  manual: FixedIncomePosition,
  candidates: readonly PluggyFixedIncomePosition[]
): PluggyFixedIncomePosition[] {
  const manualValue = displayValue(manual);
  const kind = manual.kind.toUpperCase();

  return candidates
    .filter((c) => c.id !== null)
    .map((candidate, index) => {
      const value = candidate.currentValue ?? candidate.investedAmount;
      const diff =
        value === null
          ? Number.POSITIVE_INFINITY
          : Math.abs(value - manualValue) / Math.max(Math.abs(manualValue), 0.01);
      return {
        candidate,
        index,
        sameMaturity: candidate.maturityDate === manual.maturity_date ? 0 : 1,
        diff,
        kindMatch: candidate.subtype?.toUpperCase().includes(kind) ? 0 : 1,
      };
    })
    .sort(
      (a, b) =>
        a.sameMaturity - b.sameMaturity ||
        (a.diff === b.diff ? 0 : a.diff < b.diff ? -1 : 1) ||
        a.kindMatch - b.kindMatch ||
        a.index - b.index
    )
    .map(({ candidate }) => candidate);
}

export interface ConsolidatedFixedIncome {
  /** Vínculos resolvidos — a página de Investimentos usa para os avisos. */
  links: ManualLinksResolution;
  /** Centavos da conexão que entram no total (0 carregando/desligada/em erro). */
  pluggyCents: number;
  /**
   * Centavos da RF manual que entram no total, já sem as posições cobertas por
   * vínculo ativo. `undefined` quando a leitura manual falhou ou não terminou.
   */
  manualCents: number | undefined;
  /**
   * RF consolidada (manual líquida + conexão), em centavos. `null` quando a
   * leitura MANUAL não está disponível — mesma regra de `buildInvestmentsOverview`
   * (`fixedIncomeAvailable`): sem a manual não há como saber o que está
   * coberto, então a RF inteira fica de fora em vez de virar meio número.
   */
  totalCents: number | null;
}

/**
 * RF consolidada sem dupla contagem manual↔conexão (T-091d, fatia d4). É a
 * mesma conta que o hub de Investimentos já fazia inline desde a d3b — extraída
 * para a Home somar exatamente o mesmo número no patrimônio total.
 *
 * O total manual vem do resumo do servidor (`current_value ?? invested_amount`)
 * menos o que está coberto por vínculo ativo — em dado consistente é
 * exatamente o `manualCentsCounted`.
 */
export function consolidateFixedIncome(
  summary: FixedIncomeSummary | null,
  positions: readonly FixedIncomePosition[],
  pluggyResponse: PluggyFixedIncomeResponse | null,
  pluggyFailed: boolean
): ConsolidatedFixedIncome {
  const links = resolveManualLinks(positions, pluggyResponse, pluggyFailed);
  const pluggyCents = pluggyCentsForTotal(pluggyFixedIncomeView(pluggyResponse, pluggyFailed));
  const manualCents =
    summary !== null
      ? Math.round(summary.totalCurrent * 100) - links.coveredManualCents
      : undefined;
  return {
    links,
    pluggyCents,
    manualCents,
    totalCents: manualCents === undefined ? null : manualCents + pluggyCents,
  };
}
