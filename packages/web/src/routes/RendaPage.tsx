import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createIncomeEntry,
  createIncomeSource,
  deleteIncomeEntry,
  deleteIncomeSource,
  getIncomeEntries,
  getIncomeSources,
  updateIncomeEntry,
  updateIncomeSource,
} from '../api';
import type {
  IncomeEntry,
  IncomeEntryUpdate,
  IncomeSource,
  IncomeSourceType,
  IncomeSourceUpdate,
} from '@vetor-wallet/shared';
import { diffEditableFields, hasEdits, parseMoneyInput } from './inlineEdit';
// Helpers de mês da T-022: não são específicos de despesas, então a visão mensal
// de renda reusa os mesmos (nada duplicado aqui).
import { currentMonthKey, formatDayMonth, formatMonthLabel, shiftMonth } from './expenseMonth';
import { computeIncomeMonthTotals } from './incomeMonth';
import { MonthFetchGuard } from './monthFetch';
import {
  buildIncomeFormPayload,
  initialIncomeFormState,
  resetIncomeFormFields,
  switchIncomeFormKind,
  validateIncomeForm,
} from './rendaForm';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { BackToHomeLink } from '../components/BackToHomeLink';
import './layers.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const TYPE_LABELS: Record<IncomeSourceType, string> = {
  SALARIO: 'Salário',
  FREELA: 'Freelance',
  OUTRO: 'Outro',
};

/** Primeiro dia do mês exibido, usado como default do campo de data do form. */
function defaultEntryDate(monthKey: string): string {
  const today = currentMonthKey();
  if (monthKey === today) return new Date().toISOString().slice(0, 10);
  return `${monthKey}-01`;
}

/** Campos editáveis de uma fonte fixa, na representação do form (T-031). */
interface EditDraft {
  name: string;
  type: IncomeSourceType;
  amount: string;
}

function toDraft(source: IncomeSource): EditDraft {
  return { name: source.name, type: source.type, amount: String(source.amount) };
}

/** Campos editáveis de uma renda variável, na representação do form (T-036). */
interface EntryDraft {
  description: string;
  amount: string;
  date: string;
}

function toEntryDraft(entry: IncomeEntry): EntryDraft {
  return { description: entry.description, amount: String(entry.amount), date: entry.date };
}

/**
 * Rota `/renda`: visão mensal com duas seções — "Renda fixa do mês"
 * (`income_sources`, sem data, valem para todo mês exibido) e "Renda variável do mês"
 * (`income_entries`, datadas, filtradas por mês no server — T-036).
 * O total do hero é fixas + variáveis do mês exibido; a navegação ‹ / › troca
 * o mês e recarrega apenas as rendas variáveis.
 *
 * T-031: renda fixa do mês e renda variável do mês têm modo de edição no item da lista
 * (lápis → campos preenchidos → salvar/cancelar), via `PATCH /api/income/:id` e
 * `PATCH /api/income-entries/:id` com apenas os campos alterados.
 *
 * T-075: a página abre em modo consulta — total do mês → listas — sem nenhum
 * form visível. Criar uma renda (fixa ou avulsa, com o mesmo toggle de tipo do
 * `rendaForm.ts`) fica atrás de "+ Adicionar renda" (`CollapsibleSection`,
 * recolhido por padrão), espelhando o padrão de `/despesas` (T-074).
 */
export function RendaPage() {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());

  const [sources, setSources] = useState<IncomeSource[] | 'loading' | 'error'>('loading');
  // T-075: form unificado de criação (Fixa/Avulsa), recolhido por padrão
  // atrás de "+ Adicionar renda" — substitui os dois forms permanentes que a
  // page tinha antes ("Nova fonte fixa" e "Nova renda do mês").
  const [formState, setFormState] = useState(() =>
    initialIncomeFormState(defaultEntryDate(currentMonthKey())),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [entries, setEntries] = useState<IncomeEntry[] | 'loading' | 'error'>('loading');
  // Guarda de resposta obsoleta (padrão T-030): cliques rápidos em ‹/› disparam
  // fetches concorrentes por mês; a última chamada DISPARADA (não a última a
  // resolver) é a que deve valer.
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

  const refresh = useCallback(async () => {
    setSources('loading');
    try {
      setSources(await getIncomeSources());
    } catch {
      setSources('error');
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
      const data = await getIncomeEntries(month);
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
  }, [refresh]);

  useEffect(() => {
    refreshEntries(monthKey);
  }, [monthKey, refreshEntries]);

  const list = Array.isArray(sources) ? sources : [];
  const entryList = Array.isArray(entries) ? entries : [];
  const totals = computeIncomeMonthTotals(list, entryList);

  // Degradação parcial do hero (padrão T-030): quando uma das duas fontes do
  // total está em erro, `list`/`entryList` caem para `[]` e a parcela quebrada
  // somaria 0 — um valor subestimado que parece válido. Em vez disso, qualquer
  // parcela/total que dependa de uma fonte quebrada exibe "—".
  const fixedFailed = sources === 'error';
  const variableFailed = entries === 'error';
  const totalDisplay = fixedFailed || variableFailed ? '—' : fmtCur.format(totals.total);
  const fixedDisplay = fixedFailed ? '—' : fmtCur.format(totals.fixed);
  const variableDisplay = variableFailed ? '—' : fmtCur.format(totals.variable);

  function applyMonth(next: string) {
    setMonthKey(next);
    setFormState((prev) => ({ ...prev, date: defaultEntryDate(next) }));
    // A lista de rendas do mês vai ser trocada — um rascunho de edição aberto
    // apontaria para um item que não está mais em tela.
    cancelEntryEdit();
  }

  function goToMonth(delta: number) {
    applyMonth(shiftMonth(monthKey, delta));
  }

  /**
   * Submit do form unificado (T-075): valida e monta o payload em
   * `rendaForm.ts` conforme o `kind` escolhido (Fixa → `POST /api/income`,
   * Avulsa → `POST /api/income-entries`).
   */
  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const validationError = validateIncomeForm(formState);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    const parsed = buildIncomeFormPayload(formState);

    setSubmitting(true);
    try {
      if (parsed.kind === 'FIXED') {
        const created = await createIncomeSource(parsed.payload);
        setSources((prev) => (Array.isArray(prev) ? [created, ...prev] : [created]));
      } else {
        const created = await createIncomeEntry(parsed.payload);
        // Uma renda salva com data fora do mês exibido não entra nesta lista.
        if (created.date.slice(0, 7) === monthKey) {
          setEntries((prev) =>
            Array.isArray(prev)
              ? [created, ...prev].sort((a, b) => b.date.localeCompare(a.date))
              : [created],
          );
        }
      }
      setFormState((prev) => resetIncomeFormFields(prev, defaultEntryDate(monthKey)));
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : parsed.kind === 'FIXED'
            ? 'Falha ao criar fonte de renda'
            : 'Falha ao criar renda do mês',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(source: IncomeSource) {
    setEditingId(source.id);
    setEditDraft(toDraft(source));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent, source: IncomeSource) {
    e.preventDefault();
    if (!editDraft) return;
    setEditError(null);

    if (!editDraft.name.trim()) {
      setEditError('Informe um nome para a fonte de renda.');
      return;
    }
    const parsedAmount = parseMoneyInput(editDraft.amount);
    if (parsedAmount === null) {
      setEditError('Informe um valor válido maior que zero.');
      return;
    }

    // Só os campos alterados vão no PATCH; sem mudança nenhuma, fecha o modo de
    // edição sem chamar a API (um PATCH vazio responderia 400).
    const diff = diffEditableFields(toDraft(source), {
      ...editDraft,
      name: editDraft.name.trim(),
      amount: String(parsedAmount),
    });
    if (!hasEdits(diff)) {
      cancelEdit();
      return;
    }

    const update: IncomeSourceUpdate = {};
    if (diff.name !== undefined) update.name = diff.name;
    if (diff.type !== undefined) update.type = diff.type;
    if (diff.amount !== undefined) update.amount = parsedAmount;

    setSavingEdit(true);
    try {
      const saved = await updateIncomeSource(source.id, update);
      setSources((prev) =>
        Array.isArray(prev) ? prev.map((s) => (s.id === saved.id ? saved : s)) : prev,
      );
      cancelEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Falha ao atualizar fonte de renda');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteIncomeSource(id);
      setSources((prev) => (Array.isArray(prev) ? prev.filter((s) => s.id !== id) : prev));
    } catch {
      // mantém o item na lista se a exclusão falhar; refaz o fetch para
      // garantir consistência com o servidor.
      refresh();
    } finally {
      setDeletingId(null);
    }
  }

  // ── Rendas variáveis do mês (T-036) ────────────────────────────────────────

  function startEntryEdit(entry: IncomeEntry) {
    setEditingEntryId(entry.id);
    setEntryDraft(toEntryDraft(entry));
    setEntryEditError(null);
  }

  function cancelEntryEdit() {
    setEditingEntryId(null);
    setEntryDraft(null);
    setEntryEditError(null);
  }

  async function handleEntryEditSubmit(e: React.FormEvent, entry: IncomeEntry) {
    e.preventDefault();
    if (!entryDraft) return;
    setEntryEditError(null);

    if (!entryDraft.description.trim()) {
      setEntryEditError('Informe uma descrição para a renda.');
      return;
    }
    const parsedAmount = parseMoneyInput(entryDraft.amount);
    if (parsedAmount === null) {
      setEntryEditError('Informe um valor válido maior que zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDraft.date)) {
      setEntryEditError('Informe a data da renda.');
      return;
    }

    const diff = diffEditableFields(toEntryDraft(entry), {
      description: entryDraft.description.trim(),
      amount: String(parsedAmount),
      date: entryDraft.date,
    });
    if (!hasEdits(diff)) {
      cancelEntryEdit();
      return;
    }

    const update: IncomeEntryUpdate = {};
    if (diff.description !== undefined) update.description = diff.description;
    if (diff.amount !== undefined) update.amount = parsedAmount;
    if (diff.date !== undefined) update.date = diff.date;

    setSavingEntryEdit(true);
    try {
      const saved = await updateIncomeEntry(entry.id, update);
      setEntries((prev) => {
        if (!Array.isArray(prev)) return prev;
        // Editar a data pode mover a renda para fora do mês exibido — nesse caso
        // ela sai desta lista (o server já não a devolveria neste mês).
        if (saved.date.slice(0, 7) !== monthKey) {
          return prev.filter((item) => item.id !== saved.id);
        }
        return prev
          .map((item) => (item.id === saved.id ? saved : item))
          .sort((a, b) => b.date.localeCompare(a.date));
      });
      cancelEntryEdit();
    } catch (err) {
      setEntryEditError(err instanceof Error ? err.message : 'Falha ao atualizar renda do mês');
    } finally {
      setSavingEntryEdit(false);
    }
  }

  async function handleEntryDelete(id: number) {
    setDeletingEntryId(id);
    try {
      await deleteIncomeEntry(id);
      setEntries((prev) => (Array.isArray(prev) ? prev.filter((e) => e.id !== id) : prev));
    } catch {
      // T-054: force — a remoção otimista acima já mexeu na lista; se o dedupe
      // do MonthFetchGuard achasse que já há um fetch deste mês em voo, essa
      // reconciliação seria engolida e o item ficaria removido indevidamente.
      refreshEntries(monthKey, { force: true });
    } finally {
      setDeletingEntryId(null);
    }
  }

  return (
    <div>
      <BackToHomeLink />
      <div className="vw-page-header">
        <h1 className="vw-page-title">Renda</h1>
        <p className="vw-page-subtitle">Renda fixa e renda variável do mês</p>
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

      {/* T-075: form unificado (Fixa/Avulsa), recolhido por padrão — a
          consulta (total, listas) fica sempre visível; lançar uma renda é a
          ação minoritária. */}
      <CollapsibleSection label="+ Adicionar renda" openLabel="Adicionar renda">
        <form className="vw-layerpage-form" onSubmit={handleAddSubmit}>
          <div className="vw-expense-kind-toggle" role="radiogroup" aria-label="Tipo de renda">
            <button
              type="button"
              className={`vw-expense-kind-btn${
                formState.kind === 'FIXED' ? ' vw-expense-kind-active' : ''
              }`}
              aria-pressed={formState.kind === 'FIXED'}
              onClick={() => setFormState((prev) => switchIncomeFormKind(prev, 'FIXED'))}
            >
              Fixa
            </button>
            <button
              type="button"
              className={`vw-expense-kind-btn${
                formState.kind === 'VARIABLE' ? ' vw-expense-kind-active' : ''
              }`}
              aria-pressed={formState.kind === 'VARIABLE'}
              onClick={() => setFormState((prev) => switchIncomeFormKind(prev, 'VARIABLE'))}
            >
              Avulsa
            </button>
          </div>
          <div className="vw-layerpage-field">
            <label htmlFor="renda-nome">{formState.kind === 'FIXED' ? 'Nome' : 'Descrição'}</label>
            <input
              id="renda-nome"
              type="text"
              value={formState.name}
              onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={
                formState.kind === 'FIXED' ? 'Ex.: Salário CLT' : 'Ex.: Freela de landing page'
              }
            />
          </div>
          {formState.kind === 'FIXED' && (
            <div className="vw-layerpage-field">
              <label htmlFor="renda-tipo">Tipo</label>
              <select
                id="renda-tipo"
                value={formState.type}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    type: e.target.value as IncomeSourceType,
                  }))
                }
              >
                <option value="SALARIO">Salário</option>
                <option value="FREELA">Freelance</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
          )}
          <div className="vw-layerpage-field">
            <label htmlFor="renda-valor">Valor</label>
            <input
              id="renda-valor"
              type="number"
              min="0"
              step="0.01"
              value={formState.amount}
              onChange={(e) => setFormState((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="0,00"
            />
          </div>
          {formState.kind === 'VARIABLE' && (
            <div className="vw-layerpage-field">
              <label htmlFor="renda-data">Data</label>
              <input
                id="renda-data"
                type="date"
                value={formState.date}
                onChange={(e) => setFormState((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
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

      <div className="vw-layerpage-grid">
        <div className="vw-layerpage-card">
          <h2 className="vw-layerpage-card-title">
            Renda fixa do mês
            {!fixedFailed && <span className="vw-layerpage-card-aside">{fixedDisplay}</span>}
          </h2>

          {sources === 'loading' && <p className="vw-layerpage-state">Carregando…</p>}
          {sources === 'error' && (
            <p className="vw-layerpage-error">Não foi possível carregar suas fontes de renda.</p>
          )}
          {Array.isArray(sources) && sources.length === 0 && (
            <p className="vw-layerpage-state">Nenhuma fonte fixa cadastrada ainda.</p>
          )}
          {Array.isArray(sources) && sources.length > 0 && (
            <ul className="vw-layerpage-list">
              {sources.map((s) =>
                editingId === s.id && editDraft ? (
                  <li key={s.id}>
                    <form
                      className="vw-layerpage-item-edit"
                      onSubmit={(e) => handleEditSubmit(e, s)}
                    >
                      <div className="vw-layerpage-edit-grid">
                        <div className="vw-layerpage-field">
                          <label htmlFor={`renda-edit-nome-${s.id}`}>Nome</label>
                          <input
                            id={`renda-edit-nome-${s.id}`}
                            type="text"
                            value={editDraft.name}
                            disabled={savingEdit}
                            onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                          />
                        </div>
                        <div className="vw-layerpage-field">
                          <label htmlFor={`renda-edit-tipo-${s.id}`}>Tipo</label>
                          <select
                            id={`renda-edit-tipo-${s.id}`}
                            value={editDraft.type}
                            disabled={savingEdit}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, type: e.target.value as IncomeSourceType })
                            }
                          >
                            <option value="SALARIO">Salário</option>
                            <option value="FREELA">Freelance</option>
                            <option value="OUTRO">Outro</option>
                          </select>
                        </div>
                        <div className="vw-layerpage-field">
                          <label htmlFor={`renda-edit-valor-${s.id}`}>Valor</label>
                          <input
                            id={`renda-edit-valor-${s.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={editDraft.amount}
                            disabled={savingEdit}
                            onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                          />
                        </div>
                      </div>
                      {editError && <p className="vw-layerpage-error">{editError}</p>}
                      <div className="vw-layerpage-edit-actions">
                        <button
                          type="button"
                          className="vw-layerpage-edit-cancel"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="vw-btn-primary vw-layerpage-edit-save"
                          disabled={savingEdit}
                        >
                          {savingEdit ? 'Salvando…' : 'Salvar'}
                        </button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={s.id}>
                    <div className="vw-layerpage-item">
                      <div className="vw-layerpage-item-main">
                        <p className="vw-layerpage-item-name">{s.name}</p>
                        <p className="vw-layerpage-item-tag">{TYPE_LABELS[s.type]}</p>
                      </div>
                      <div className="vw-layerpage-item-right">
                        <span className="vw-layerpage-item-value">{fmtCur.format(s.amount)}</span>
                        <button
                          type="button"
                          className="vw-layerpage-edit-btn"
                          onClick={() => startEdit(s)}
                          disabled={editingId !== null || deletingId === s.id}
                          aria-label={`Editar ${s.name}`}
                          title="Editar"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="vw-layerpage-delete-btn"
                          onClick={() => handleDelete(s.id)}
                          disabled={deletingId === s.id || editingId !== null}
                          aria-label={`Remover ${s.name}`}
                          title="Remover"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
          <p className="vw-history-hint">
            Renda fixa não tem data — vale integralmente para qualquer mês exibido.
          </p>
        </div>

        <div className="vw-layerpage-card">
          <h2 className="vw-layerpage-card-title">
            Renda variável do mês
            {!variableFailed && <span className="vw-layerpage-card-aside">{variableDisplay}</span>}
          </h2>

          {entries === 'loading' && <p className="vw-layerpage-state">Carregando…</p>}
          {entries === 'error' && (
            <p className="vw-layerpage-error">Não foi possível carregar as rendas do mês.</p>
          )}
          {Array.isArray(entries) && entries.length === 0 && (
            <p className="vw-layerpage-state">
              Nenhuma renda avulsa em {formatMonthLabel(monthKey)}.
            </p>
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
                          <label htmlFor={`renda-lanc-edit-descricao-${entry.id}`}>Descrição</label>
                          <input
                            id={`renda-lanc-edit-descricao-${entry.id}`}
                            type="text"
                            value={entryDraft.description}
                            disabled={savingEntryEdit}
                            onChange={(e) =>
                              setEntryDraft({ ...entryDraft, description: e.target.value })
                            }
                          />
                        </div>
                        <div className="vw-layerpage-field">
                          <label htmlFor={`renda-lanc-edit-valor-${entry.id}`}>Valor</label>
                          <input
                            id={`renda-lanc-edit-valor-${entry.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={entryDraft.amount}
                            disabled={savingEntryEdit}
                            onChange={(e) => setEntryDraft({ ...entryDraft, amount: e.target.value })}
                          />
                        </div>
                        <div className="vw-layerpage-field">
                          <label htmlFor={`renda-lanc-edit-data-${entry.id}`}>Data</label>
                          <input
                            id={`renda-lanc-edit-data-${entry.id}`}
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
                        <p className="vw-layerpage-item-name">{entry.description}</p>
                        <p className="vw-layerpage-item-tag">{formatDayMonth(entry.date)}</p>
                      </div>
                      <div className="vw-layerpage-item-right">
                        <span className="vw-layerpage-item-value">{fmtCur.format(entry.amount)}</span>
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
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
