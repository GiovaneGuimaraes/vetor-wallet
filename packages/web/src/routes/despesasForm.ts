/**
 * Estado e payload do form unificado de "+ Adicionar despesa" (T-074).
 *
 * `/despesas` tinha dois forms permanentes ("Nova despesa fixa" e "Novo
 * lançamento"); esta tarefa funde os dois num único form com um toggle
 * Fixa/Variável, recolhido atrás de um `CollapsibleSection`. A lógica de
 * validação/payload é extraída aqui (função pura, testável sem DOM) em vez de
 * inline no componente, seguindo o mesmo padrão de `inlineEdit.ts`.
 */

export type ExpenseFormKind = 'FIXED' | 'VARIABLE';

export interface ExpenseFormState {
  kind: ExpenseFormKind;
  /** Nome (Fixa) ou descrição (Variável) — mesmo campo, rótulo muda no form. */
  name: string;
  category: string;
  /** Valor bruto digitado (aceita vírgula decimal, igual aos outros forms de layer). */
  amount: string;
  /** Só usado quando `kind === 'VARIABLE'`. */
  date: string;
  /** "Repetir todo mês" — só disponível/aplicado quando `kind === 'VARIABLE'`. */
  recurring: boolean;
}

/** Estado inicial do form, com a data default do mês exibido na page. */
export function initialExpenseFormState(defaultDate: string): ExpenseFormState {
  return { kind: 'FIXED', name: '', category: '', amount: '', date: defaultDate, recurring: false };
}

/**
 * Limpa os campos preenchidos após um submit bem-sucedido, mantendo o `kind`
 * escolhido (o usuário costuma lançar várias despesas do mesmo tipo seguidas).
 */
export function resetExpenseFormFields(
  state: ExpenseFormState,
  defaultDate: string,
): ExpenseFormState {
  return { ...state, name: '', category: '', amount: '', date: defaultDate, recurring: false };
}

/** Troca o tipo (Fixa/Variável), preservando nome/categoria/valor já digitados. */
export function switchExpenseFormKind(
  state: ExpenseFormState,
  kind: ExpenseFormKind,
): ExpenseFormState {
  return { ...state, kind };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Mesma conversão usada nos demais forms de layer: vírgula como separador decimal. */
function parseAmount(raw: string): number {
  return Number(raw.replace(',', '.'));
}

/** Valida o form conforme o `kind` atual; `null` quando válido. */
export function validateExpenseForm(state: ExpenseFormState): string | null {
  if (!state.name.trim()) {
    return state.kind === 'FIXED'
      ? 'Informe um nome para a despesa.'
      : 'Informe uma descrição para o lançamento.';
  }
  const parsedAmount = parseAmount(state.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return 'Informe um valor válido maior que zero.';
  }
  if (state.kind === 'VARIABLE' && !DATE_RE.test(state.date)) {
    return 'Informe a data do lançamento.';
  }
  return null;
}

export interface FixedExpensePayload {
  name: string;
  category: string;
  amount: number;
}

export interface VariableExpensePayload {
  description: string;
  category: string;
  amount: number;
  date: string;
  recurring?: true;
}

export type ExpenseFormPayload =
  | { kind: 'FIXED'; payload: FixedExpensePayload }
  | { kind: 'VARIABLE'; payload: VariableExpensePayload };

/**
 * Monta o payload de criação a partir do estado do form, já validado
 * (chame `validateExpenseForm` antes — esta função assume estado válido e não
 * revalida, para não duplicar as mensagens de erro).
 */
export function buildExpenseFormPayload(state: ExpenseFormState): ExpenseFormPayload {
  const amount = parseAmount(state.amount);
  if (state.kind === 'FIXED') {
    return {
      kind: 'FIXED',
      payload: { name: state.name.trim(), category: state.category.trim(), amount },
    };
  }
  return {
    kind: 'VARIABLE',
    payload: {
      description: state.name.trim(),
      category: state.category.trim(),
      amount,
      date: state.date,
      ...(state.recurring ? { recurring: true } : {}),
    },
  };
}
