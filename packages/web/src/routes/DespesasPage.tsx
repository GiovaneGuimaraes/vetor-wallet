import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createExpenseEntry,
  createFixedExpense,
  deleteExpenseEntry,
  deleteFixedExpense,
  endRecurringExpense,
  getExpenseEntries,
  getExpenseEntriesSummary,
  getFixedExpenses,
  getRecurringExpenses,
  importOfx,
  updateExpenseEntry,
  updateFixedExpense,
} from '../api';
import type {
  ExpenseEntry,
  ExpenseEntryUpdate,
  ExpenseMonthSummaryItem,
  FixedExpense,
  FixedExpenseUpdate,
  OfxImportResult,
  RecurringExpense,
} from '@vetor-wallet/shared';
import {
  activeRecurrences,
  formatRecurrenceDay,
  isRecurringOccurrence,
  startsLaterThanEntry,
  totalRecurring,
} from './recurrence';
import { diffEditableFields, hasEdits, parseMoneyInput } from './inlineEdit';
import { groupByCategory } from './expensesGrouping';
import { MonthFetchGuard } from './monthFetch';
import {
  formatOfxCounts,
  formatOfxRejectionReason,
  formatOfxTransactionAmount,
  formatOfxTransactionDate,
  formatOfxTransactionDescription,
  groupOfxTransactionsByStatus,
  ofxStatusLabel,
  type OfxImportUiState,
} from './ofxImportReport';
import {
  buildMonthlyHistory,
  computeMonthTotals,
  currentMonthKey,
  formatDayMonth,
  formatMonthLabel,
  shiftMonth,
} from './expenseMonth';
import { formatCategoryLabel } from './categories';
import {
  buildExpenseFormPayload,
  initialExpenseFormState,
  resetExpenseFormFields,
  switchExpenseFormKind,
  validateExpenseForm,
} from './despesasForm';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { BackToHomeLink } from '../components/BackToHomeLink';
import { MASCOT_FILE_BY_LAYER } from '../layout/mascots';
import './layers.css';

const HISTORY_MONTHS = 6;

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Primeiro dia do mês exibido, usado como default do campo de data do form. */
function defaultEntryDate(monthKey: string): string {
  const today = currentMonthKey();
  if (monthKey === today) return new Date().toISOString().slice(0, 10);
  return `${monthKey}-01`;
}

/** Campos editáveis de uma despesa fixa, na representação do form (T-031). */
interface FixedDraft {
  name: string;
  category: string;
  amount: string;
}

function toFixedDraft(expense: FixedExpense): FixedDraft {
  return { name: expense.name, category: expense.category, amount: String(expense.amount) };
}

/** Campos editáveis de um lançamento variável, na representação do form. */
interface EntryDraft {
  description: string;
  category: string;
  amount: string;
  date: string;
}

function toEntryDraft(entry: ExpenseEntry): EntryDraft {
  return {
    description: entry.description,
    category: entry.category,
    amount: String(entry.amount),
    date: entry.date,
  };
}

/**
 * Rota `/despesas`: visão mensal com duas seções — "Fixas do mês"
 * (`fixed_expenses`, sem data, valem para todo mês) e "Lançamentos do mês"
 * (`expense_entries`, datados, filtrados por mês no server — T-022).
 * O total do hero é fixas + variáveis do mês exibido; a navegação
 * ‹ / › troca o mês e recarrega apenas os lançamentos.
 *
 * T-074: a página abre em modo consulta — total do mês → últimos meses →
 * orçamentos → recorrências → listas — sem nenhum form visível. Criar uma
 * despesa (fixa ou variável, com o mesmo toggle de tipo do `despesasForm.ts`)
 * fica atrás de "+ Adicionar despesa" (`CollapsibleSection`, recolhido por
 * padrão).
 *
 * T-082: a seção "Orçamento do mês" (removida do render na T-037) volta a
 * aparecer sempre — toda categoria com teto cadastrado é listada, mesmo sem
 * gasto no mês exibido (barra a 0%). Só o form de novo orçamento fica atrás
 * de um `CollapsibleSection` próprio.
 *
 * T-031: fixas e lançamentos têm modo de edição no item da lista (lápis →
 * campos preenchidos → salvar/cancelar), via `PATCH /api/expenses/:id` e
 * `PATCH /api/expense-entries/:id` com apenas os campos alterados.
 */
export function DespesasPage() {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());

  const [expenses, setExpenses] = useState<FixedExpense[] | 'loading' | 'error'>('loading');
  // T-074: form unificado de criação (Fixa/Variável), recolhido por padrão
  // atrás de "+ Adicionar despesa" — substitui os dois forms permanentes que
  // a page tinha antes ("Nova despesa fixa" e "Novo lançamento").
  const [formState, setFormState] = useState(() =>
    initialExpenseFormState(defaultEntryDate(currentMonthKey()))
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingFixedId, setEditingFixedId] = useState<number | null>(null);
  const [fixedDraft, setFixedDraft] = useState<FixedDraft | null>(null);
  const [fixedEditError, setFixedEditError] = useState<string | null>(null);
  const [savingFixedEdit, setSavingFixedEdit] = useState(false);

  const [entries, setEntries] = useState<ExpenseEntry[] | 'loading' | 'error'>('loading');
  // Guarda de resposta obsoleta (T-030): cliques rápidos em ‹/› disparam fetches
  // concorrentes por mês; a última chamada DISPARADA (não a última a resolver)
  // é a que deve valer. `latestRequestedMonthRef` guarda o mês mais recente
  // pedido — se um fetch mais antigo resolve depois de um mais novo já ter
  // sido disparado, seu resultado é descartado.
  const latestRequestedMonthRef = useRef<string>(currentMonthKey());
  // Dedupe de fetches concorrentes do mesmo mês (T-049) — complementa a guarda
  // acima, que decide qual resposta VALE; esta decide se um novo fetch deve
  // ser disparado quando já há um em andamento para o mesmo mês.
  const entriesFetchGuardRef = useRef(new MonthFetchGuard());
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [entryEditError, setEntryEditError] = useState<string | null>(null);
  const [savingEntryEdit, setSavingEntryEdit] = useState(false);

  const [historySummary, setHistorySummary] = useState<
    ExpenseMonthSummaryItem[] | 'loading' | 'error'
  >('loading');

  // T-035: recorrências mensais. O checkbox "Repetir todo mês" do form
  // unificado cria uma (`recurring: true` no POST); esta lista é a gestão
  // mínima para encerrá-las.
  const [recurrences, setRecurrences] = useState<RecurringExpense[] | 'loading' | 'error'>(
    'loading'
  );
  const [endingRecurrenceId, setEndingRecurrenceId] = useState<number | null>(null);

  // T-086: importação de extrato OFX. Estado ocioso → enviando → relatório →
  // erro; o input de arquivo fica sempre re-selecionável (não desmonta).
  const [ofxState, setOfxState] = useState<OfxImportUiState>('idle');
  const [ofxResult, setOfxResult] = useState<OfxImportResult | null>(null);
  const [ofxError, setOfxError] = useState<string | null>(null);
  const ofxFileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setExpenses('loading');
    try {
      setExpenses(await getFixedExpenses());
    } catch {
      setExpenses('error');
    }
  }, []);

  // T-033: histórico não depende do mês navegado — é sempre os últimos
  // HISTORY_MONTHS meses até o mês corrente REAL (não o exibido na navegação).
  //
  // T-049: `endMonth` é enviado como `currentMonthKey()` (fuso do BROWSER) em
  // vez de deixar o server inferir sozinho pelo fuso do processo — resolve o
  // "ponto de atenção conhecido" da T-033 (linha "atual" zerada por instantes
  // na virada de mês, quando os fusos client/server divergem).
  const refreshHistory = useCallback(async () => {
    // Evita o flicker de "Carregando…" numa revalidação (após criar/editar/
    // remover um lançamento): só volta para 'loading' quando ainda não há
    // nenhum dado carregado — os dados anteriores continuam visíveis
    // enquanto o refetch está em andamento.
    setHistorySummary((prev) => (Array.isArray(prev) ? prev : 'loading'));
    try {
      const data = await getExpenseEntriesSummary(HISTORY_MONTHS, currentMonthKey());
      setHistorySummary(data.months);
    } catch {
      setHistorySummary('error');
    }
  }, []);

  const refreshRecurrences = useCallback(async () => {
    setRecurrences('loading');
    try {
      setRecurrences(await getRecurringExpenses());
    } catch {
      setRecurrences('error');
    }
  }, []);

  const refreshEntries = useCallback(async (month: string, options?: { force?: boolean }) => {
    // T-049: se já há um fetch em andamento para este MESMO mês, não dispara
    // outro — evita requests duplicados (ex.: cliques rápidos que resolvem no
    // mesmo mês, ou o efeito reexecutando duas vezes em StrictMode).
    // T-054: `force` (usado pelo refetch de reconciliação após falha de
    // delete, abaixo) ignora esse dedupe — a remoção otimista já aconteceu na
    // lista e precisa ser corrigida mesmo que o guard ache que já há um fetch
    // deste mês em voo.
    if (!entriesFetchGuardRef.current.shouldFetch(month, options)) return;
    latestRequestedMonthRef.current = month;
    setEntries('loading');
    try {
      const data = await getExpenseEntries(month);
      // Se um mês mais novo já foi pedido enquanto esta resposta estava a
      // caminho, esta resolveu por último mas não é mais a requisição atual —
      // descarta para não sobrescrever o mês exibido com valores de outro mês.
      if (latestRequestedMonthRef.current !== month) return;
      setEntries(data.entries);
    } catch {
      if (latestRequestedMonthRef.current !== month) return;
      setEntries('error');
    } finally {
      entriesFetchGuardRef.current.finish(month);
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshHistory();
    refreshRecurrences();
  }, [refresh, refreshHistory, refreshRecurrences]);

  useEffect(() => {
    refreshEntries(monthKey);
  }, [monthKey, refreshEntries]);

  const list = Array.isArray(expenses) ? expenses : [];
  const entryList = Array.isArray(entries) ? entries : [];
  const recurrenceList = Array.isArray(recurrences) ? activeRecurrences(recurrences) : [];
  const totals = computeMonthTotals(list, entryList);
  const groups = groupByCategory(list);

  // Degradação parcial do hero (T-030): quando uma das duas fontes do total
  // (fixas ou variáveis) está em erro, `list`/`entryList` caem para `[]` e
  // `totals` soma a fonte quebrada como 0 — um valor subestimado que parece
  // válido. Em vez disso, qualquer parcela/total que dependa de uma fonte
  // quebrada exibe "—".
  const fixedFailed = expenses === 'error';
  const variableFailed = entries === 'error';
  const totalDisplay = fixedFailed || variableFailed ? '—' : fmtCur.format(totals.total);
  const fixedDisplay = fixedFailed ? '—' : fmtCur.format(totals.fixed);
  const variableDisplay = variableFailed ? '—' : fmtCur.format(totals.variable);

  // Barra de orçamento (T-030): `expenses`/`entries` ainda em loading fazem o
  // gasto (`spent`) ficar subestimado (fonte incompleta) — em vez de piscar
  // uma barra com valor errado por um instante, mostra um placeholder até as
  // duas fontes carregarem.

  // Histórico "Últimos meses" (T-033): fixas vigentes HOJE (mesmas de
  // `totals.fixed`, já que despesas fixas não têm histórico por mês) somadas
  // ao total variável de cada mês devolvido por `GET /api/expense-entries/summary`.
  const monthlyHistory =
    Array.isArray(historySummary) && !fixedFailed
      ? buildMonthlyHistory(HISTORY_MONTHS, currentMonthKey(), historySummary, totals.fixed)
      : [];

  // Troca o mês exibido na navegação mensal — usado tanto pelas setas ‹/›
  // quanto pelo clique num mês do histórico (T-033).
  function applyMonth(next: string) {
    setMonthKey(next);
    setFormState((prev) => ({ ...prev, date: defaultEntryDate(next) }));
    // A lista de lançamentos vai ser trocada — um rascunho de edição aberto
    // apontaria para um item que não está mais em tela.
    cancelEntryEdit();
  }

  function goToMonth(delta: number) {
    applyMonth(shiftMonth(monthKey, delta));
  }

  /**
   * Submit do form unificado (T-074): valida e monta o payload em
   * `despesasForm.ts` conforme o `kind` escolhido (Fixa → `POST
   * /api/expenses`, Variável → `POST /api/expense-entries`, com
   * `recurring: true` quando "Repetir todo mês" está marcado).
   */
  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const validationError = validateExpenseForm(formState);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    const parsed = buildExpenseFormPayload(formState);

    setSubmitting(true);
    try {
      if (parsed.kind === 'FIXED') {
        const created = await createFixedExpense(parsed.payload);
        setExpenses((prev) => (Array.isArray(prev) ? [created, ...prev] : [created]));
      } else {
        const created = await createExpenseEntry(parsed.payload);
        // Um lançamento salvo com data fora do mês exibido não entra nesta lista.
        if (created.date.slice(0, 7) === monthKey) {
          setEntries((prev) =>
            Array.isArray(prev)
              ? [created, ...prev].sort((a, b) => b.date.localeCompare(a.date))
              : [created]
          );
        }
        // Novo lançamento muda o total variável do mês em que caiu — revalida
        // o histórico para não ficar com um valor desatualizado na tela.
        refreshHistory();
        if (parsed.payload.recurring) {
          refreshRecurrences();
        }
      }
      setFormState((prev) => resetExpenseFormFields(prev, defaultEntryDate(monthKey)));
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : parsed.kind === 'FIXED'
            ? 'Falha ao criar despesa fixa'
            : 'Falha ao criar lançamento'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteFixedExpense(id);
      setExpenses((prev) => (Array.isArray(prev) ? prev.filter((e) => e.id !== id) : prev));
    } catch {
      refresh();
    } finally {
      setDeletingId(null);
    }
  }

  function startFixedEdit(expense: FixedExpense) {
    setEditingFixedId(expense.id);
    setFixedDraft(toFixedDraft(expense));
    setFixedEditError(null);
  }

  function cancelFixedEdit() {
    setEditingFixedId(null);
    setFixedDraft(null);
    setFixedEditError(null);
  }

  async function handleFixedEditSubmit(e: React.FormEvent, expense: FixedExpense) {
    e.preventDefault();
    if (!fixedDraft) return;
    setFixedEditError(null);

    if (!fixedDraft.name.trim()) {
      setFixedEditError('Informe um nome para a despesa.');
      return;
    }
    const parsedAmount = parseMoneyInput(fixedDraft.amount);
    if (parsedAmount === null) {
      setFixedEditError('Informe um valor válido maior que zero.');
      return;
    }

    const diff = diffEditableFields(toFixedDraft(expense), {
      name: fixedDraft.name.trim(),
      category: fixedDraft.category.trim(),
      amount: String(parsedAmount),
    });
    if (!hasEdits(diff)) {
      cancelFixedEdit();
      return;
    }

    const update: FixedExpenseUpdate = {};
    if (diff.name !== undefined) update.name = diff.name;
    if (diff.category !== undefined) update.category = diff.category;
    if (diff.amount !== undefined) update.amount = parsedAmount;

    setSavingFixedEdit(true);
    try {
      // A resposta traz a categoria já normalizada (T-028) — trocá-la aqui
      // reagrupa a lista pelo `groupByCategory` sem refetch.
      const saved = await updateFixedExpense(expense.id, update);
      setExpenses((prev) =>
        Array.isArray(prev) ? prev.map((item) => (item.id === saved.id ? saved : item)) : prev
      );
      cancelFixedEdit();
    } catch (err) {
      setFixedEditError(err instanceof Error ? err.message : 'Falha ao atualizar despesa fixa');
    } finally {
      setSavingFixedEdit(false);
    }
  }

  function startEntryEdit(entry: ExpenseEntry) {
    setEditingEntryId(entry.id);
    setEntryDraft(toEntryDraft(entry));
    setEntryEditError(null);
  }

  function cancelEntryEdit() {
    setEditingEntryId(null);
    setEntryDraft(null);
    setEntryEditError(null);
  }

  async function handleEntryEditSubmit(e: React.FormEvent, entry: ExpenseEntry) {
    e.preventDefault();
    if (!entryDraft) return;
    setEntryEditError(null);

    if (!entryDraft.description.trim()) {
      setEntryEditError('Informe uma descrição para o lançamento.');
      return;
    }
    const parsedAmount = parseMoneyInput(entryDraft.amount);
    if (parsedAmount === null) {
      setEntryEditError('Informe um valor válido maior que zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDraft.date)) {
      setEntryEditError('Informe a data do lançamento.');
      return;
    }

    const diff = diffEditableFields(toEntryDraft(entry), {
      description: entryDraft.description.trim(),
      category: entryDraft.category.trim(),
      amount: String(parsedAmount),
      date: entryDraft.date,
    });
    if (!hasEdits(diff)) {
      cancelEntryEdit();
      return;
    }

    const update: ExpenseEntryUpdate = {};
    if (diff.description !== undefined) update.description = diff.description;
    if (diff.category !== undefined) update.category = diff.category;
    if (diff.amount !== undefined) update.amount = parsedAmount;
    if (diff.date !== undefined) update.date = diff.date;

    setSavingEntryEdit(true);
    try {
      const saved = await updateExpenseEntry(entry.id, update);
      setEntries((prev) => {
        if (!Array.isArray(prev)) return prev;
        // Editar a data pode mover o lançamento para fora do mês exibido — nesse
        // caso ele sai desta lista (o server já não o devolveria neste mês).
        if (saved.date.slice(0, 7) !== monthKey) {
          return prev.filter((item) => item.id !== saved.id);
        }
        return prev
          .map((item) => (item.id === saved.id ? saved : item))
          .sort((a, b) => b.date.localeCompare(a.date));
      });
      cancelEntryEdit();
      // O total variável do mês editado mudou (ou o lançamento mudou de mês) —
      // o histórico de "Últimos meses" ficaria com um valor contraditório em
      // relação ao "Total do mês" se não revalidasse aqui também.
      refreshHistory();
    } catch (err) {
      setEntryEditError(err instanceof Error ? err.message : 'Falha ao atualizar lançamento');
    } finally {
      setSavingEntryEdit(false);
    }
  }

  async function handleEntryDelete(id: number) {
    setDeletingEntryId(id);
    try {
      await deleteExpenseEntry(id);
      setEntries((prev) => (Array.isArray(prev) ? prev.filter((e) => e.id !== id) : prev));
      refreshHistory();
    } catch {
      // T-054: force — a remoção otimista acima já mexeu na lista; se o dedupe
      // do MonthFetchGuard achasse que já há um fetch deste mês em voo, essa
      // reconciliação seria engolida e o item ficaria removido indevidamente.
      refreshEntries(monthKey, { force: true });
    } finally {
      setDeletingEntryId(null);
    }
  }

  /**
   * Encerra a recorrência (T-035): para de gerar ocorrências futuras. As já
   * materializadas continuam na lista de lançamentos — por isso não é preciso
   * recarregar `entries` aqui.
   */
  async function handleEndRecurrence(id: number) {
    setEndingRecurrenceId(id);
    try {
      await endRecurringExpense(id);
      setRecurrences((prev) => (Array.isArray(prev) ? prev.filter((r) => r.id !== id) : prev));
    } catch {
      refreshRecurrences();
    } finally {
      setEndingRecurrenceId(null);
    }
  }

  /**
   * Upload de extrato OFX (T-086): lê o arquivo como `ArrayBuffer` (não
   * `file.text()` — pré-decodificar como UTF-8 corromperia extratos em
   * cp1252; o server decide o charset pelo header OFX) e envia o corpo cru
   * a `POST /api/import/ofx`. Sucesso com `imported > 0` revalida os
   * lançamentos do mês exibido e o histórico, já que a importação pode ter
   * escrito em qualquer mês, não só no exibido.
   */
  async function handleOfxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOfxState('uploading');
    setOfxError(null);
    setOfxResult(null);
    try {
      const bytes = await file.arrayBuffer();
      const result = await importOfx(bytes);
      setOfxResult(result);
      setOfxState('report');
      if (result.imported > 0) {
        refreshEntries(monthKey, { force: true });
        refreshHistory();
      }
    } catch (err) {
      setOfxError(err instanceof Error ? err.message : 'Falha ao importar extrato OFX');
      setOfxState('error');
    } finally {
      // Permite reimportar o mesmo arquivo (o browser não disparia `onChange`
      // de novo para o mesmo caminho sem limpar o valor do input).
      if (ofxFileInputRef.current) ofxFileInputRef.current.value = '';
    }
  }

  return (
    <div>
      <BackToHomeLink />
      <div className="vw-page-header-row">
        <div className="vw-page-header">
          <h1 className="vw-page-title">Despesas</h1>
          <p className="vw-page-subtitle">Gastos fixos e do dia a dia</p>
        </div>
        <img
          src={`/layers/${MASCOT_FILE_BY_LAYER.despesas}`}
          alt=""
          className="vw-page-mascot"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      </div>

      <div className="vw-hero-card">
        <div className="vw-month-nav">
          <button
            type="button"
            className="vw-month-nav-btn"
            onClick={() => goToMonth(-1)}
            aria-label="Mês anterior"
            title="Mês anterior"
          >
            ‹
          </button>
          <span className="vw-month-nav-label">{formatMonthLabel(monthKey)}</span>
          <button
            type="button"
            className="vw-month-nav-btn"
            onClick={() => goToMonth(1)}
            aria-label="Próximo mês"
            title="Próximo mês"
          >
            ›
          </button>
        </div>
        <p className="vw-hero-total-label">Total do mês</p>
        <p className="vw-hero-total-value">{totalDisplay}</p>
        <p className="vw-month-breakdown">
          Fixas {fixedDisplay} + variáveis {variableDisplay}
        </p>
      </div>

      {/* T-074: form unificado (Fixa/Variável), recolhido por padrão — a
          consulta (total, histórico, recorrências, listas) fica sempre
          visível; lançar uma despesa é a ação minoritária. */}
      <CollapsibleSection label="Adicionar despesa" openLabel="Adicionar despesa">
        <form className="vw-layerpage-form" onSubmit={handleAddSubmit}>
          <div className="vw-expense-kind-toggle" role="radiogroup" aria-label="Tipo de despesa">
            <button
              type="button"
              className={`vw-expense-kind-btn${
                formState.kind === 'FIXED' ? ' vw-expense-kind-active' : ''
              }`}
              aria-pressed={formState.kind === 'FIXED'}
              onClick={() => setFormState((prev) => switchExpenseFormKind(prev, 'FIXED'))}
            >
              Fixa
            </button>
            <button
              type="button"
              className={`vw-expense-kind-btn${
                formState.kind === 'VARIABLE' ? ' vw-expense-kind-active' : ''
              }`}
              aria-pressed={formState.kind === 'VARIABLE'}
              onClick={() => setFormState((prev) => switchExpenseFormKind(prev, 'VARIABLE'))}
            >
              Variável
            </button>
          </div>
          <div className="vw-layerpage-field">
            <label htmlFor="despesa-nome">
              {formState.kind === 'FIXED' ? 'Nome' : 'Descrição'}
            </label>
            <input
              id="despesa-nome"
              type="text"
              value={formState.name}
              onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={formState.kind === 'FIXED' ? 'Ex.: Aluguel' : 'Ex.: Mercado'}
            />
          </div>
          <div className="vw-layerpage-field">
            <label htmlFor="despesa-categoria">Categoria</label>
            <input
              id="despesa-categoria"
              type="text"
              value={formState.category}
              onChange={(e) => setFormState((prev) => ({ ...prev, category: e.target.value }))}
              placeholder={formState.kind === 'FIXED' ? 'Ex.: Moradia' : 'Ex.: Alimentação'}
            />
          </div>
          <div className="vw-layerpage-field">
            <label htmlFor="despesa-valor">Valor</label>
            <input
              id="despesa-valor"
              type="number"
              min="0"
              step="0.01"
              value={formState.amount}
              onChange={(e) => setFormState((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="0,00"
            />
          </div>
          {formState.kind === 'VARIABLE' && (
            <>
              <div className="vw-layerpage-field">
                <label htmlFor="despesa-data">Data</label>
                <input
                  id="despesa-data"
                  type="date"
                  value={formState.date}
                  onChange={(e) => setFormState((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <label className="vw-recurrence-checkbox" htmlFor="despesa-recorrente">
                <input
                  id="despesa-recorrente"
                  type="checkbox"
                  checked={formState.recurring}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, recurring: e.target.checked }))
                  }
                />
                <span>
                  Repetir todo mês
                  <span className="vw-recurrence-checkbox-hint">
                    Gera este lançamento nos próximos meses, no mesmo dia.
                  </span>
                </span>
              </label>
              {/* A recorrência nunca retroage: com data passada ela começa no
                  mês corrente, e os meses já fechados ficam como estão. */}
              {formState.recurring &&
                startsLaterThanEntry(formState.date.slice(0, 7), currentMonthKey()) && (
                  <p className="vw-recurrence-checkbox-hint">
                    A data escolhida está num mês passado — a repetição começa em{' '}
                    {formatMonthLabel(currentMonthKey())} e não altera meses anteriores.
                  </p>
                )}
            </>
          )}
          {formError && <p className="vw-layerpage-error">{formError}</p>}
          <button
            type="submit"
            className="vw-btn-primary vw-layerpage-submit"
            disabled={submitting}
          >
            {submitting ? 'Adicionando…' : 'Adicionar'}
          </button>
        </form>
      </CollapsibleSection>

      {/* T-086: importação de extrato OFX — porta de entrada visível para o
          fluxo backend da T-085. Recolhida por padrão, junto das demais
          seções de ação minoritária. */}
      <CollapsibleSection label="Importar extrato (OFX)" openLabel="Importar extrato (OFX)">
        <div className="vw-layerpage-form">
          <p className="vw-history-hint">
            Envie o arquivo .ofx exportado do internet banking do seu banco. Créditos entram como
            renda e débitos como despesa; reimportar o mesmo extrato não duplica nada.
          </p>
          <div className="vw-layerpage-field">
            <label htmlFor="ofx-file">Arquivo OFX</label>
            <input
              id="ofx-file"
              ref={ofxFileInputRef}
              type="file"
              accept=".ofx,.qfx"
              disabled={ofxState === 'uploading'}
              onChange={handleOfxUpload}
            />
          </div>

          {ofxState === 'uploading' && <p className="vw-layerpage-state">Importando…</p>}
          {ofxState === 'error' && ofxError && <p className="vw-layerpage-error">{ofxError}</p>}

          {ofxState === 'report' && ofxResult && (
            <div className="vw-ofx-report">
              <p className="vw-layerpage-item-name">{formatOfxCounts(ofxResult)}</p>
              {ofxResult.transactions.length > 0 && (
                <ul className="vw-layerpage-list">
                  {(() => {
                    const grouped = groupOfxTransactionsByStatus(ofxResult.transactions);
                    return [...grouped.imported, ...grouped.duplicated, ...grouped.rejected];
                  })().map((tx, idx) => (
                    <li key={`${tx.fitid ?? 'sem-fitid'}-${idx}`}>
                      <div className="vw-layerpage-item">
                        <div className="vw-layerpage-item-main">
                          <p className="vw-layerpage-item-name">
                            {formatOfxTransactionDescription(tx)}
                          </p>
                          <p className="vw-layerpage-item-tag">
                            {formatOfxTransactionDate(tx)} · {ofxStatusLabel(tx.status)}
                            {tx.status === 'rejected' ? ` · ${formatOfxRejectionReason(tx)}` : ''}
                          </p>
                        </div>
                        <div className="vw-layerpage-item-right">
                          <span className="vw-layerpage-item-value">
                            {formatOfxTransactionAmount(tx)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </CollapsibleSection>

      <div className="vw-layerpage-card vw-history-card">
        <h2 className="vw-layerpage-card-title">Últimos meses</h2>

        {historySummary === 'loading' && <p className="vw-layerpage-state">Carregando…</p>}
        {historySummary === 'error' && (
          <p className="vw-layerpage-error">Não foi possível carregar o histórico de meses.</p>
        )}
        {fixedFailed && historySummary !== 'loading' && historySummary !== 'error' && (
          <p className="vw-layerpage-error">
            Não foi possível carregar suas despesas fixas — o histórico depende delas.
          </p>
        )}

        {monthlyHistory.length > 0 && (
          <>
            <p className="vw-history-hint">
              A parcela de fixas é sempre a vigente hoje — não há histórico de quando uma despesa
              fixa passou a existir.
            </p>
            <ul className="vw-history-list">
              {monthlyHistory.map((row) => (
                <li key={row.month}>
                  <button
                    type="button"
                    className={`vw-history-item${row.isCurrent ? ' vw-history-current' : ''}${
                      row.month === monthKey ? ' vw-history-selected' : ''
                    }`}
                    onClick={() => applyMonth(row.month)}
                    title="Fixas vigentes hoje + lançamentos variáveis daquele mês"
                  >
                    <span className="vw-history-item-main">
                      <span className="vw-history-item-label">
                        {row.label}
                        {row.isCurrent && <span className="vw-history-item-badge">atual</span>}
                      </span>
                      <span className="vw-history-item-breakdown">
                        Fixas {fmtCur.format(row.fixed)} + variáveis {fmtCur.format(row.variable)}
                      </span>
                    </span>
                    <span className="vw-history-item-value">{fmtCur.format(row.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="vw-layerpage-card vw-recurrence-card">
        <h2 className="vw-layerpage-card-title">
          Recorrências mensais
          {recurrenceList.length > 0 && (
            <span className="vw-layerpage-card-aside">
              {fmtCur.format(totalRecurring(recurrenceList))}/mês
            </span>
          )}
        </h2>

        {recurrences === 'loading' && <p className="vw-layerpage-state">Carregando…</p>}
        {recurrences === 'error' && (
          <p className="vw-layerpage-error">Não foi possível carregar suas recorrências.</p>
        )}
        {Array.isArray(recurrences) && recurrenceList.length === 0 && (
          <p className="vw-layerpage-state">
            Nenhuma recorrência ativa. Marque “Repetir todo mês” ao criar um lançamento.
          </p>
        )}

        {recurrenceList.length > 0 && (
          <>
            <p className="vw-history-hint">
              A ocorrência de cada mês é criada quando você abre aquele mês, e depois pode ser
              editada ou excluída como um lançamento comum. Encerrar não apaga as já criadas.
            </p>
            <ul className="vw-layerpage-list">
              {recurrenceList.map((recurrence) => (
                <li key={recurrence.id}>
                  <div className="vw-layerpage-item">
                    <div className="vw-layerpage-item-main">
                      <p className="vw-layerpage-item-name">{recurrence.description}</p>
                      <p className="vw-layerpage-item-tag">
                        {formatRecurrenceDay(recurrence.day_of_month)}
                        {formatCategoryLabel(recurrence.category)
                          ? ` · ${formatCategoryLabel(recurrence.category)}`
                          : ''}
                      </p>
                    </div>
                    <div className="vw-layerpage-item-right">
                      <span className="vw-layerpage-item-value">
                        {fmtCur.format(recurrence.amount)}
                      </span>
                      <button
                        type="button"
                        className="vw-layerpage-edit-cancel vw-recurrence-end-btn"
                        onClick={() => handleEndRecurrence(recurrence.id)}
                        disabled={endingRecurrenceId === recurrence.id}
                        title="Parar de gerar ocorrências futuras"
                      >
                        {endingRecurrenceId === recurrence.id ? 'Encerrando…' : 'Encerrar'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="vw-layerpage-grid">
        <div className="vw-layerpage-card">
          <h2 className="vw-layerpage-card-title">Fixas do mês</h2>

          {expenses === 'loading' && <p className="vw-layerpage-state">Carregando…</p>}
          {expenses === 'error' && (
            <p className="vw-layerpage-error">Não foi possível carregar suas despesas fixas.</p>
          )}
          {Array.isArray(expenses) && expenses.length === 0 && (
            <p className="vw-layerpage-state">Nenhuma despesa fixa cadastrada ainda.</p>
          )}
          {groups.map((group) => (
            <div className="vw-layerpage-group" key={group.category}>
              <div className="vw-layerpage-group-header">
                <span className="vw-layerpage-group-name">{group.category}</span>
                <span className="vw-layerpage-group-total">{fmtCur.format(group.total)}</span>
              </div>
              <ul className="vw-layerpage-list">
                {group.items.map((expense) =>
                  editingFixedId === expense.id && fixedDraft ? (
                    <li key={expense.id}>
                      <form
                        className="vw-layerpage-item-edit"
                        onSubmit={(e) => handleFixedEditSubmit(e, expense)}
                      >
                        <div className="vw-layerpage-edit-grid">
                          <div className="vw-layerpage-field">
                            <label htmlFor={`fixa-edit-nome-${expense.id}`}>Nome</label>
                            <input
                              id={`fixa-edit-nome-${expense.id}`}
                              type="text"
                              value={fixedDraft.name}
                              disabled={savingFixedEdit}
                              onChange={(e) =>
                                setFixedDraft({ ...fixedDraft, name: e.target.value })
                              }
                            />
                          </div>
                          <div className="vw-layerpage-field">
                            <label htmlFor={`fixa-edit-categoria-${expense.id}`}>Categoria</label>
                            <input
                              id={`fixa-edit-categoria-${expense.id}`}
                              type="text"
                              value={fixedDraft.category}
                              disabled={savingFixedEdit}
                              onChange={(e) =>
                                setFixedDraft({ ...fixedDraft, category: e.target.value })
                              }
                            />
                          </div>
                          <div className="vw-layerpage-field">
                            <label htmlFor={`fixa-edit-valor-${expense.id}`}>Valor</label>
                            <input
                              id={`fixa-edit-valor-${expense.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={fixedDraft.amount}
                              disabled={savingFixedEdit}
                              onChange={(e) =>
                                setFixedDraft({ ...fixedDraft, amount: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        {fixedEditError && <p className="vw-layerpage-error">{fixedEditError}</p>}
                        <div className="vw-layerpage-edit-actions">
                          <button
                            type="button"
                            className="vw-layerpage-edit-cancel"
                            onClick={cancelFixedEdit}
                            disabled={savingFixedEdit}
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="vw-btn-primary vw-layerpage-edit-save"
                            disabled={savingFixedEdit}
                          >
                            {savingFixedEdit ? 'Salvando…' : 'Salvar'}
                          </button>
                        </div>
                      </form>
                    </li>
                  ) : (
                    <li key={expense.id}>
                      <div className="vw-layerpage-item">
                        <div className="vw-layerpage-item-main">
                          <p className="vw-layerpage-item-name">{expense.name}</p>
                        </div>
                        <div className="vw-layerpage-item-right">
                          <span className="vw-layerpage-item-value">
                            {fmtCur.format(expense.amount)}
                          </span>
                          <button
                            type="button"
                            className="vw-layerpage-edit-btn"
                            onClick={() => startFixedEdit(expense)}
                            disabled={editingFixedId !== null || deletingId === expense.id}
                            aria-label={`Editar ${expense.name}`}
                            title="Editar"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="vw-layerpage-delete-btn"
                            onClick={() => handleDelete(expense.id)}
                            disabled={deletingId === expense.id || editingFixedId !== null}
                            aria-label={`Remover ${expense.name}`}
                            title="Remover"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="vw-layerpage-card">
          <h2 className="vw-layerpage-card-title">
            Lançamentos do mês
            <span className="vw-layerpage-card-aside">{fmtCur.format(totals.variable)}</span>
          </h2>

          {entries === 'loading' && <p className="vw-layerpage-state">Carregando…</p>}
          {entries === 'error' && (
            <p className="vw-layerpage-error">Não foi possível carregar os lançamentos do mês.</p>
          )}
          {Array.isArray(entries) && entries.length === 0 && (
            <p className="vw-layerpage-state">Nenhum lançamento em {formatMonthLabel(monthKey)}.</p>
          )}
          {entryList.length > 0 && (
            <ul className="vw-layerpage-list">
              {entryList.map((entry) =>
                editingEntryId === entry.id && entryDraft ? (
                  <li key={entry.id}>
                    <form
                      className="vw-layerpage-item-edit"
                      onSubmit={(e) => handleEntryEditSubmit(e, entry)}
                    >
                      <div className="vw-layerpage-edit-grid">
                        <div className="vw-layerpage-field">
                          <label htmlFor={`lanc-edit-descricao-${entry.id}`}>Descrição</label>
                          <input
                            id={`lanc-edit-descricao-${entry.id}`}
                            type="text"
                            value={entryDraft.description}
                            disabled={savingEntryEdit}
                            onChange={(e) =>
                              setEntryDraft({ ...entryDraft, description: e.target.value })
                            }
                          />
                        </div>
                        <div className="vw-layerpage-field">
                          <label htmlFor={`lanc-edit-categoria-${entry.id}`}>Categoria</label>
                          <input
                            id={`lanc-edit-categoria-${entry.id}`}
                            type="text"
                            value={entryDraft.category}
                            disabled={savingEntryEdit}
                            onChange={(e) =>
                              setEntryDraft({ ...entryDraft, category: e.target.value })
                            }
                          />
                        </div>
                        <div className="vw-layerpage-field">
                          <label htmlFor={`lanc-edit-valor-${entry.id}`}>Valor</label>
                          <input
                            id={`lanc-edit-valor-${entry.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={entryDraft.amount}
                            disabled={savingEntryEdit}
                            onChange={(e) =>
                              setEntryDraft({ ...entryDraft, amount: e.target.value })
                            }
                          />
                        </div>
                        <div className="vw-layerpage-field">
                          <label htmlFor={`lanc-edit-data-${entry.id}`}>Data</label>
                          <input
                            id={`lanc-edit-data-${entry.id}`}
                            type="date"
                            value={entryDraft.date}
                            disabled={savingEntryEdit}
                            onChange={(e) => setEntryDraft({ ...entryDraft, date: e.target.value })}
                          />
                        </div>
                      </div>
                      {entryEditError && <p className="vw-layerpage-error">{entryEditError}</p>}
                      <div className="vw-layerpage-edit-actions">
                        <button
                          type="button"
                          className="vw-layerpage-edit-cancel"
                          onClick={cancelEntryEdit}
                          disabled={savingEntryEdit}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="vw-btn-primary vw-layerpage-edit-save"
                          disabled={savingEntryEdit}
                        >
                          {savingEntryEdit ? 'Salvando…' : 'Salvar'}
                        </button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={entry.id}>
                    <div className="vw-layerpage-item">
                      <div className="vw-layerpage-item-main">
                        <p className="vw-layerpage-item-name">
                          {entry.description}
                          {isRecurringOccurrence(entry) && (
                            <span
                              className="vw-recurrence-badge"
                              title="Gerado por uma recorrência mensal"
                            >
                              ↻ recorrente
                            </span>
                          )}
                        </p>
                        <p className="vw-layerpage-item-tag">
                          {formatDayMonth(entry.date)}
                          {formatCategoryLabel(entry.category)
                            ? ` · ${formatCategoryLabel(entry.category)}`
                            : ''}
                        </p>
                      </div>
                      <div className="vw-layerpage-item-right">
                        <span className="vw-layerpage-item-value">
                          {fmtCur.format(entry.amount)}
                        </span>
                        <button
                          type="button"
                          className="vw-layerpage-edit-btn"
                          onClick={() => startEntryEdit(entry)}
                          disabled={editingEntryId !== null || deletingEntryId === entry.id}
                          aria-label={`Editar ${entry.description}`}
                          title="Editar"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="vw-layerpage-delete-btn"
                          onClick={() => handleEntryDelete(entry.id)}
                          disabled={deletingEntryId === entry.id || editingEntryId !== null}
                          aria-label={`Remover ${entry.description}`}
                          title="Remover"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
