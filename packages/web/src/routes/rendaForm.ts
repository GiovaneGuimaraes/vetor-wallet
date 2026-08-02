/**
 * Estado e payload do form unificado de "+ Adicionar renda" (T-075).
 *
 * `/renda` tinha dois forms permanentes ("Nova fonte fixa" e "Nova renda do
 * mês"); esta tarefa funde os dois num único form com um toggle Fixa/Avulsa,
 * recolhido atrás de um `CollapsibleSection`. A lógica de validação/payload é
 * extraída aqui (função pura, testável sem DOM), espelhando `despesasForm.ts`
 * (T-074).
 */

import type { IncomeSourceType } from '@vetor-wallet/shared';

export type IncomeFormKind = 'FIXED' | 'VARIABLE';

export interface IncomeFormState {
  kind: IncomeFormKind;
  /** Nome (Fixa) ou descrição (Avulsa) — mesmo campo, rótulo muda no form. */
  name: string;
  /** Só usado quando `kind === 'FIXED'`. */
  type: IncomeSourceType;
  /** Valor bruto digitado (aceita vírgula decimal, igual aos outros forms de layer). */
  amount: string;
  /** Só usado quando `kind === 'VARIABLE'`. */
  date: string;
}

/** Estado inicial do form, com a data default do mês exibido na page. */
export function initialIncomeFormState(defaultDate: string): IncomeFormState {
  return { kind: 'FIXED', name: '', type: 'SALARIO', amount: '', date: defaultDate };
}

/**
 * Limpa os campos preenchidos após um submit bem-sucedido, mantendo o `kind`
 * escolhido (o usuário costuma lançar várias rendas do mesmo tipo seguidas).
 */
export function resetIncomeFormFields(
  state: IncomeFormState,
  defaultDate: string,
): IncomeFormState {
  return { ...state, name: '', type: 'SALARIO', amount: '', date: defaultDate };
}

/** Troca o tipo (Fixa/Avulsa), preservando nome/valor já digitados. */
export function switchIncomeFormKind(
  state: IncomeFormState,
  kind: IncomeFormKind,
): IncomeFormState {
  return { ...state, kind };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Mesma conversão usada nos demais forms de layer: vírgula como separador decimal. */
function parseAmount(raw: string): number {
  return Number(raw.replace(',', '.'));
}

/** Valida o form conforme o `kind` atual; `null` quando válido. */
export function validateIncomeForm(state: IncomeFormState): string | null {
  if (!state.name.trim()) {
    return state.kind === 'FIXED'
      ? 'Informe um nome para a fonte de renda.'
      : 'Informe uma descrição para a renda.';
  }
  const parsedAmount = parseAmount(state.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return 'Informe um valor válido maior que zero.';
  }
  if (state.kind === 'VARIABLE' && !DATE_RE.test(state.date)) {
    return 'Informe a data da renda.';
  }
  return null;
}

export interface FixedIncomePayload {
  name: string;
  type: IncomeSourceType;
  amount: number;
}

export interface VariableIncomePayload {
  description: string;
  amount: number;
  date: string;
}

export type IncomeFormPayload =
  | { kind: 'FIXED'; payload: FixedIncomePayload }
  | { kind: 'VARIABLE'; payload: VariableIncomePayload };

/**
 * Monta o payload de criação a partir do estado do form, já validado
 * (chame `validateIncomeForm` antes — esta função assume estado válido e não
 * revalida, para não duplicar as mensagens de erro).
 */
export function buildIncomeFormPayload(state: IncomeFormState): IncomeFormPayload {
  const amount = parseAmount(state.amount);
  if (state.kind === 'FIXED') {
    return {
      kind: 'FIXED',
      payload: { name: state.name.trim(), type: state.type, amount },
    };
  }
  return {
    kind: 'VARIABLE',
    payload: { description: state.name.trim(), amount, date: state.date },
  };
}
