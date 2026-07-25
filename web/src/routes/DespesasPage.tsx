import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createExpenseEntry,
  createFixedExpense,
  deleteBudget,
  deleteExpenseEntry,
  deleteFixedExpense,
  getBudgets,
  getExpenseEntries,
  getFixedExpenses,
  upsertBudget,
} from '../api';
import type { CategoryBudget, ExpenseEntry, FixedExpense } from '@vetor-wallet/shared';
import { groupByCategory } from './expensesGrouping';
import {
  computeMonthTotals,
  currentMonthKey,
  formatDayMonth,
  formatMonthLabel,
  shiftMonth,
} from './expenseMonth';
import { computeBudgetProgress, formatBudgetPct } from './budgetProgress';
import { formatCategoryLabel, normalizeCategory } from './categories';
import './layers.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Primeiro dia do mês exibido, usado como default do campo de data do form. */
function defaultEntryDate(monthKey: string): string {
  const today = currentMonthKey();
  if (monthKey === today) return new Date().toISOString().slice(0, 10);
  return `${monthKey}-01`;
}

/**
 * Rota `/despesas`: visão mensal com duas seções — "Fixas do mês"
 * (`fixed_expenses`, sem data, valem para todo mês) e "Lançamentos do mês"
 * (`expense_entries`, datados, filtrados por mês no server — T-022).
 * O total do hero é fixas + variáveis do mês exibido; a navegação
 * ‹ / › troca o mês e recarrega apenas os lançamentos.
 */
export function DespesasPage() {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());

  const [expenses, setExpenses] = useState<FixedExpense[] | 'loading' | 'error'>('loading');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [entries, setEntries] = useState<ExpenseEntry[] | 'loading' | 'error'>('loading');
  // Guarda de resposta obsoleta (T-030): cliques rápidos em ‹/› disparam fetches
  // concorrentes por mês; a última chamada DISPARADA (não a última a resolver)
  // é a que deve valer. `latestRequestedMonthRef` guarda o mês mais recente
  // pedido — se um fetch mais antigo resolve depois de um mais novo já ter
  // sido disparado, seu resultado é descartado.
  const latestRequestedMonthRef = useRef<string>(currentMonthKey());
  const [entryDescription, setEntryDescription] = useState('');
  const [entryCategory, setEntryCategory] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState(() => defaultEntryDate(currentMonthKey()));
  const [entryFormError, setEntryFormError] = useState<string | null>(null);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);

  const [budgets, setBudgets] = useState<CategoryBudget[] | 'loading' | 'error'>('loading');
  const [budgetCategory, setBudgetCategory] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetFormError, setBudgetFormError] = useState<string | null>(null);
  const [budgetSubmitting, setBudgetSubmitting] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] = useState<number | null>(null);

  const refreshBudgets = useCallback(async () => {
    setBudgets('loading');
    try {
      setBudgets(await getBudgets());
    } catch {
      setBudgets('error');
    }
  }, []);

  const refresh = useCallback(async () => {
    setExpenses('loading');
    try {
      setExpenses(await getFixedExpenses());
    } catch {
      setExpenses('error');
    }
  }, []);

  const refreshEntries = useCallback(async (month: string) => {
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
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshBudgets();
  }, [refresh, refreshBudgets]);

  useEffect(() => {
    refreshEntries(monthKey);
  }, [monthKey, refreshEntries]);

  const list = Array.isArray(expenses) ? expenses : [];
  const entryList = Array.isArray(entries) ? entries : [];
  const budgetList = Array.isArray(budgets) ? budgets : [];
  const totals = computeMonthTotals(list, entryList);
  const groups = groupByCategory(list);
  const budgetProgress = computeBudgetProgress(budgetList, list, entryList);

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
  const budgetSourcesLoading = expenses === 'loading' || entries === 'loading';

  function goToMonth(delta: number) {
    const next = shiftMonth(monthKey, delta);
    setMonthKey(next);
    setEntryDate(defaultEntryDate(next));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!name.trim()) {
      setFormError('Informe um nome para a despesa.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Informe um valor válido maior que zero.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createFixedExpense({
        name: name.trim(),
        category: category.trim(),
        amount: parsedAmount,
      });
      setExpenses((prev) => (Array.isArray(prev) ? [created, ...prev] : [created]));
      setName('');
      setCategory('');
      setAmount('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar despesa fixa');
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

  async function handleEntrySubmit(e: React.FormEvent) {
    e.preventDefault();
    setEntryFormError(null);
    const parsedAmount = Number(entryAmount.replace(',', '.'));
    if (!entryDescription.trim()) {
      setEntryFormError('Informe uma descrição para o lançamento.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setEntryFormError('Informe um valor válido maior que zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      setEntryFormError('Informe a data do lançamento.');
      return;
    }

    setEntrySubmitting(true);
    try {
      const created = await createExpenseEntry({
        description: entryDescription.trim(),
        category: entryCategory.trim(),
        amount: parsedAmount,
        date: entryDate,
      });
      // Um lançamento salvo com data fora do mês exibido não entra nesta lista.
      if (created.date.slice(0, 7) === monthKey) {
        setEntries((prev) =>
          Array.isArray(prev)
            ? [created, ...prev].sort((a, b) => b.date.localeCompare(a.date))
            : [created],
        );
      }
      setEntryDescription('');
      setEntryCategory('');
      setEntryAmount('');
    } catch (err) {
      setEntryFormError(err instanceof Error ? err.message : 'Falha ao criar lançamento');
    } finally {
      setEntrySubmitting(false);
    }
  }

  async function handleEntryDelete(id: number) {
    setDeletingEntryId(id);
    try {
      await deleteExpenseEntry(id);
      setEntries((prev) => (Array.isArray(prev) ? prev.filter((e) => e.id !== id) : prev));
    } catch {
      refreshEntries(monthKey);
    } finally {
      setDeletingEntryId(null);
    }
  }

  async function handleBudgetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBudgetFormError(null);
    const parsedAmount = Number(budgetAmount.replace(',', '.'));
    if (!budgetCategory.trim()) {
      setBudgetFormError('Informe a categoria do orçamento.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setBudgetFormError('Informe um teto válido maior que zero.');
      return;
    }

    setBudgetSubmitting(true);
    try {
      const saved = await upsertBudget({ category: budgetCategory.trim(), amount: parsedAmount });
      // Upsert: substitui o registro existente da mesma categoria, se houver.
      // A comparação usa a forma canônica (T-028) — o server grava normalizado,
      // mas a lista em memória pode conter valores legados ainda não migrados.
      setBudgets((prev) => {
        if (!Array.isArray(prev)) return [saved];
        const savedCategory = normalizeCategory(saved.category);
        const others = prev.filter((b) => normalizeCategory(b.category) !== savedCategory);
        return [...others, saved].sort((a, b) => a.category.localeCompare(b.category));
      });
      setBudgetCategory('');
      setBudgetAmount('');
    } catch (err) {
      setBudgetFormError(err instanceof Error ? err.message : 'Falha ao salvar orçamento');
    } finally {
      setBudgetSubmitting(false);
    }
  }

  async function handleBudgetDelete(id: number) {
    setDeletingBudgetId(id);
    try {
      await deleteBudget(id);
      setBudgets((prev) => (Array.isArray(prev) ? prev.filter((b) => b.id !== id) : prev));
    } catch {
      refreshBudgets();
    } finally {
      setDeletingBudgetId(null);
    }
  }

  return (
    <div>
      <div className="vw-page-header">
        <h1 className="vw-page-title">Despesas</h1>
        <p className="vw-page-subtitle">Gastos fixos e do dia a dia</p>
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

      <div className="vw-layerpage-card vw-budget-card">
        <h2 className="vw-layerpage-card-title">Orçamento do mês</h2>

        {budgets === 'loading' && <p className="vw-layerpage-state">Carregando…</p>}
        {budgets === 'error' && (
          <p className="vw-layerpage-error">Não foi possível carregar seus orçamentos.</p>
        )}
        {Array.isArray(budgets) && budgets.length === 0 && (
          <p className="vw-layerpage-state">Nenhum orçamento cadastrado ainda.</p>
        )}

        {Array.isArray(budgets) && budgets.length > 0 && budgetSourcesLoading && (
          <p className="vw-layerpage-state">Carregando gastos do mês…</p>
        )}

        {!budgetSourcesLoading && budgetProgress.length > 0 && (
          <ul className="vw-budget-list">
            {budgetProgress.map((progress) => (
              <li key={progress.id} className="vw-budget-item">
                <div className="vw-budget-item-header">
                  <span className="vw-budget-item-category">{progress.category}</span>
                  <div className="vw-budget-item-right">
                    <span className="vw-budget-item-amounts">
                      {fmtCur.format(progress.spent)} de {fmtCur.format(progress.amount)}
                    </span>
                    <button
                      type="button"
                      className="vw-layerpage-delete-btn"
                      onClick={() => handleBudgetDelete(progress.id)}
                      disabled={deletingBudgetId === progress.id}
                      aria-label={`Remover orçamento de ${progress.category}`}
                      title="Remover"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="vw-budget-progress-track">
                  <div
                    className={`vw-budget-progress-fill${progress.over ? ' vw-budget-over' : ''}`}
                    style={{ width: `${progress.pctClamped}%` }}
                  />
                </div>
                <p className={`vw-budget-progress-pct${progress.over ? ' vw-budget-over-text' : ''}`}>
                  {formatBudgetPct(progress.pct)}% do orçamento
                </p>
              </li>
            ))}
          </ul>
        )}

        <form className="vw-layerpage-form vw-budget-form" onSubmit={handleBudgetSubmit}>
          <div className="vw-layerpage-field">
            <label htmlFor="orcamento-categoria">Categoria</label>
            <input
              id="orcamento-categoria"
              type="text"
              value={budgetCategory}
              onChange={(e) => setBudgetCategory(e.target.value)}
              placeholder="Ex.: Mercado"
            />
          </div>
          <div className="vw-layerpage-field">
            <label htmlFor="orcamento-valor">Teto mensal</label>
            <input
              id="orcamento-valor"
              type="number"
              min="0"
              step="0.01"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="0,00"
            />
          </div>
          {budgetFormError && <p className="vw-layerpage-error">{budgetFormError}</p>}
          <button type="submit" className="vw-btn-primary vw-layerpage-submit" disabled={budgetSubmitting}>
            {budgetSubmitting ? 'Salvando…' : 'Salvar orçamento'}
          </button>
        </form>
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
                {group.items.map((expense) => (
                  <li key={expense.id}>
                    <div className="vw-layerpage-item">
                      <div className="vw-layerpage-item-main">
                        <p className="vw-layerpage-item-name">{expense.name}</p>
                      </div>
                      <div className="vw-layerpage-item-right">
                        <span className="vw-layerpage-item-value">{fmtCur.format(expense.amount)}</span>
                        <button
                          type="button"
                          className="vw-layerpage-delete-btn"
                          onClick={() => handleDelete(expense.id)}
                          disabled={deletingId === expense.id}
                          aria-label={`Remover ${expense.name}`}
                          title="Remover"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="vw-layerpage-card">
          <h2 className="vw-layerpage-card-title">Nova despesa fixa</h2>
          <form className="vw-layerpage-form" onSubmit={handleSubmit}>
            <div className="vw-layerpage-field">
              <label htmlFor="despesa-nome">Nome</label>
              <input
                id="despesa-nome"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Aluguel"
              />
            </div>
            <div className="vw-layerpage-field">
              <label htmlFor="despesa-categoria">Categoria</label>
              <input
                id="despesa-categoria"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex.: Moradia"
              />
            </div>
            <div className="vw-layerpage-field">
              <label htmlFor="despesa-valor">Valor</label>
              <input
                id="despesa-valor"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            {formError && <p className="vw-layerpage-error">{formError}</p>}
            <button type="submit" className="vw-btn-primary vw-layerpage-submit" disabled={submitting}>
              {submitting ? 'Adicionando…' : 'Adicionar'}
            </button>
          </form>
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
              {entryList.map((entry) => (
                <li key={entry.id}>
                  <div className="vw-layerpage-item">
                    <div className="vw-layerpage-item-main">
                      <p className="vw-layerpage-item-name">{entry.description}</p>
                      <p className="vw-layerpage-item-tag">
                        {formatDayMonth(entry.date)}
                        {formatCategoryLabel(entry.category)
                          ? ` · ${formatCategoryLabel(entry.category)}`
                          : ''}
                      </p>
                    </div>
                    <div className="vw-layerpage-item-right">
                      <span className="vw-layerpage-item-value">{fmtCur.format(entry.amount)}</span>
                      <button
                        type="button"
                        className="vw-layerpage-delete-btn"
                        onClick={() => handleEntryDelete(entry.id)}
                        disabled={deletingEntryId === entry.id}
                        aria-label={`Remover ${entry.description}`}
                        title="Remover"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="vw-layerpage-card">
          <h2 className="vw-layerpage-card-title">Novo lançamento</h2>
          <form className="vw-layerpage-form" onSubmit={handleEntrySubmit}>
            <div className="vw-layerpage-field">
              <label htmlFor="lancamento-descricao">Descrição</label>
              <input
                id="lancamento-descricao"
                type="text"
                value={entryDescription}
                onChange={(e) => setEntryDescription(e.target.value)}
                placeholder="Ex.: Mercado"
              />
            </div>
            <div className="vw-layerpage-field">
              <label htmlFor="lancamento-categoria">Categoria</label>
              <input
                id="lancamento-categoria"
                type="text"
                value={entryCategory}
                onChange={(e) => setEntryCategory(e.target.value)}
                placeholder="Ex.: Alimentação"
              />
            </div>
            <div className="vw-layerpage-field">
              <label htmlFor="lancamento-valor">Valor</label>
              <input
                id="lancamento-valor"
                type="number"
                min="0"
                step="0.01"
                value={entryAmount}
                onChange={(e) => setEntryAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="vw-layerpage-field">
              <label htmlFor="lancamento-data">Data</label>
              <input
                id="lancamento-data"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            {entryFormError && <p className="vw-layerpage-error">{entryFormError}</p>}
            <button
              type="submit"
              className="vw-btn-primary vw-layerpage-submit"
              disabled={entrySubmitting}
            >
              {entrySubmitting ? 'Adicionando…' : 'Adicionar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
