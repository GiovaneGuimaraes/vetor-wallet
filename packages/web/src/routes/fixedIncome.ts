import type {
  FixedIncomeKind,
  FixedIncomePosition,
  FixedIncomeRateType,
  NewFixedIncomePosition,
} from '@vetor-wallet/shared';

/**
 * Helpers puros da página `/investimentos/renda-fixa` (T-091c/d, fatia c2).
 *
 * Módulo sem React, sem I/O — a mesma convenção de `savingsProjection.ts` e
 * `inlineEdit.ts` (CLAUDE.md › Convenções): o componente só renderiza, a
 * lógica mora aqui e é testada sem DOM.
 *
 * O vocabulário de `kind`/`rateType` foi aprovado pelo humano (ver
 * `packages/shared/src/index.ts`) — não inventar nem reordenar. A validação do
 * formulário espelha a de `packages/rest-api/src/api/routes/fixedIncome.ts`
 * (duplicada de propósito: web não importa package de backend — mesma
 * convenção de `routes/categories.ts`).
 */

export const FIXED_INCOME_KINDS: FixedIncomeKind[] = [
  'CAIXINHA',
  'CDB',
  'LCI',
  'LCA',
  'TESOURO',
  'DEBENTURE',
  'CRI_CRA',
  'OUTRO',
];

export const FIXED_INCOME_RATE_TYPES: FixedIncomeRateType[] = ['PRE', 'CDI', 'IPCA', 'SELIC'];

export const FIXED_INCOME_KIND_LABEL: Record<FixedIncomeKind, string> = {
  CAIXINHA: 'Caixinha',
  CDB: 'CDB',
  LCI: 'LCI',
  LCA: 'LCA',
  TESOURO: 'Tesouro Direto',
  DEBENTURE: 'Debênture',
  CRI_CRA: 'CRI/CRA',
  OUTRO: 'Outro',
};

export const FIXED_INCOME_RATE_TYPE_LABEL: Record<FixedIncomeRateType, string> = {
  PRE: 'Prefixado',
  CDI: '% do CDI',
  IPCA: 'IPCA +',
  SELIC: 'SELIC +',
};

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Valor exibido de uma posição: **nunca** estimado a partir da taxa (decisão
 * do humano) — é sempre o saldo informado pelo usuário, ou o valor aplicado
 * quando não há saldo informado.
 */
export function displayValue(position: FixedIncomePosition): number {
  return position.current_value ?? position.invested_amount;
}

/** Soma do valor exibido de todas as posições, em centavos inteiros. */
export function totalDisplayValueCents(positions: FixedIncomePosition[]): number {
  return positions.reduce((sum, p) => sum + Math.round(displayValue(p) * 100), 0);
}

/** Soma do valor aplicado de todas as posições, em centavos inteiros. */
export function totalInvestedCents(positions: FixedIncomePosition[]): number {
  return positions.reduce((sum, p) => sum + Math.round(p.invested_amount * 100), 0);
}

/**
 * Ordena por vencimento, mais próximo primeiro. Posições sem vencimento
 * (liquidez diária / `maturity_date: null`) vão para o **final** da lista —
 * decisão desta fatia: o que precisa de atenção (vencimentos próximos ou já
 * vencidos) fica no topo, e a liquidez diária, que não tem prazo a vigiar, não
 * disputa espaço com eles. Empate de data: ordem estável por `id` crescente.
 */
export function sortByMaturity(positions: FixedIncomePosition[]): FixedIncomePosition[] {
  return [...positions].sort((a, b) => {
    if (a.maturity_date === null && b.maturity_date === null) return a.id - b.id;
    if (a.maturity_date === null) return 1;
    if (b.maturity_date === null) return -1;
    if (a.maturity_date !== b.maturity_date) return a.maturity_date < b.maturity_date ? -1 : 1;
    return a.id - b.id;
  });
}

/** Dias de calendário de `from` até `to` (ambos `YYYY-MM-DD`, UTC — sem fuso). */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

/**
 * Rótulo do prazo de uma posição, relativo a `todayIso` (`YYYY-MM-DD`).
 * `maturityDate: null` = liquidez diária / sem vencimento.
 */
export function maturityLabel(maturityDate: string | null, todayIso: string): string {
  if (maturityDate === null) return 'Liquidez diária';
  const diff = daysBetween(todayIso, maturityDate);
  if (diff === 0) return 'Vence hoje';
  if (diff > 0) return `Vence em ${diff} ${diff === 1 ? 'dia' : 'dias'}`;
  const overdue = Math.abs(diff);
  return `Vencido há ${overdue} ${overdue === 1 ? 'dia' : 'dias'}`;
}

/**
 * Rótulo legível da taxa, combinando `rateType` + `rate`. O número é exibido
 * com vírgula decimal (pt-BR) e sem zeros à direita além do necessário.
 */
export function rateLabel(rateType: FixedIncomeRateType, rate: number): string {
  const n = formatRateNumber(rate);
  switch (rateType) {
    case 'PRE':
      return `${n}% a.a.`;
    case 'CDI':
      return `${n}% do CDI`;
    case 'IPCA':
      return `IPCA + ${n}% a.a.`;
    case 'SELIC':
      return `SELIC + ${n}% a.a.`;
  }
}

function formatRateNumber(rate: number): string {
  // até 2 casas, sem zeros à direita desnecessários (110 fica "110", 6.5 fica "6,5").
  const rounded = Math.round(rate * 100) / 100;
  return String(rounded).replace('.', ',');
}

/**
 * Converte um valor monetário digitado em número, aceitando vírgula decimal —
 * mesma regra de `inlineEdit.parseMoneyInput`, duplicada aqui de propósito
 * (módulos de rota não importam entre si — ver instrução da tarefa). `null`
 * para entrada vazia, não numérica, infinita ou ≤ 0.
 */
export function parsePositiveAmountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/** Mesma regra, mas aceitando 0 (saldo informado pode ser zero). */
export function parseNonNegativeAmountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** Converte a taxa digitada: número finito, aceitando vírgula decimal. */
export function parseRateInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/** Valores do formulário de criar/editar posição — tudo texto, como os inputs. */
export interface FixedIncomeFormValues {
  name: string;
  kind: FixedIncomeKind;
  institution: string;
  investedAmount: string;
  investedAt: string;
  /** Vazio = sem vencimento (liquidez diária). */
  maturityDate: string;
  rateType: FixedIncomeRateType;
  rate: string;
  /** Vazio = saldo informado não preenchido. Vem junto de `currentValueDate`. */
  currentValue: string;
  currentValueDate: string;
}

export type FixedIncomeFormResult =
  { ok: true; payload: NewFixedIncomePosition } | { ok: false; error: string };

/**
 * Valida e converte o formulário no corpo que `POST /api/fixed-income` aceita
 * — espelha `validateFields`/as checagens obrigatórias da rota (não deixar o
 * usuário submeter algo que a API vai rejeitar com 400).
 */
export function parseFixedIncomeForm(values: FixedIncomeFormValues): FixedIncomeFormResult {
  const name = values.name.trim();
  if (!name) return { ok: false, error: 'Informe um nome para a posição.' };

  if (!FIXED_INCOME_KINDS.includes(values.kind)) {
    return { ok: false, error: 'Selecione o tipo da posição.' };
  }

  const investedAmount = parsePositiveAmountInput(values.investedAmount);
  if (investedAmount === null) {
    return { ok: false, error: 'Informe um valor aplicado válido, maior que zero.' };
  }

  if (!isValidIsoDate(values.investedAt)) {
    return { ok: false, error: 'Informe a data de aplicação.' };
  }

  const maturityRaw = values.maturityDate.trim();
  const maturityDate = maturityRaw === '' ? null : maturityRaw;
  if (maturityDate !== null && !isValidIsoDate(maturityDate)) {
    return { ok: false, error: 'Data de vencimento inválida.' };
  }
  if (maturityDate !== null && maturityDate < values.investedAt) {
    return { ok: false, error: 'O vencimento não pode ser anterior à data de aplicação.' };
  }

  if (!FIXED_INCOME_RATE_TYPES.includes(values.rateType)) {
    return { ok: false, error: 'Selecione o indexador da taxa.' };
  }
  const rate = parseRateInput(values.rate);
  if (rate === null) {
    return { ok: false, error: 'Informe uma taxa válida.' };
  }

  // Saldo informado: vem com a data junto, ou nenhum dos dois.
  const currentValueRaw = values.currentValue.trim();
  const currentValueDateRaw = values.currentValueDate.trim();
  if ((currentValueRaw === '') !== (currentValueDateRaw === '')) {
    return {
      ok: false,
      error: 'Informe o saldo e a data em que ele foi lido, ou deixe os dois em branco.',
    };
  }
  let currentValue: number | null = null;
  let currentValueDate: string | null = null;
  if (currentValueRaw !== '') {
    currentValue = parseNonNegativeAmountInput(currentValueRaw);
    if (currentValue === null) {
      return { ok: false, error: 'Informe um saldo válido, maior ou igual a zero.' };
    }
    if (!isValidIsoDate(currentValueDateRaw)) {
      return { ok: false, error: 'Data do saldo informado inválida.' };
    }
    currentValueDate = currentValueDateRaw;
  }

  return {
    ok: true,
    payload: {
      name,
      kind: values.kind,
      institution: values.institution.trim() || undefined,
      investedAmount,
      investedAt: values.investedAt,
      maturityDate,
      rateType: values.rateType,
      rate,
      currentValue,
      currentValueDate,
    },
  };
}

/** Rascunho de edição a partir de uma posição existente, na forma do formulário. */
export function toFormValues(position: FixedIncomePosition): FixedIncomeFormValues {
  return {
    name: position.name,
    kind: position.kind,
    institution: position.institution,
    investedAmount: String(position.invested_amount),
    investedAt: position.invested_at,
    maturityDate: position.maturity_date ?? '',
    rateType: position.rate_type,
    rate: String(position.rate),
    currentValue: position.current_value !== null ? String(position.current_value) : '',
    currentValueDate: position.current_value_date ?? '',
  };
}

export const EMPTY_FIXED_INCOME_FORM: FixedIncomeFormValues = {
  name: '',
  kind: 'CDB',
  institution: '',
  investedAmount: '',
  investedAt: '',
  maturityDate: '',
  rateType: 'PRE',
  rate: '',
  currentValue: '',
  currentValueDate: '',
};
