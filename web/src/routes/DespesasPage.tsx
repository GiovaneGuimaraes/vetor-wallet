import { useEffect, useState } from 'react';
import { createFixedExpense, deleteFixedExpense, getFixedExpenses } from '../api';
import type { FixedExpense } from '@vetor-wallet/shared';
import { groupByCategory } from './expensesGrouping';
import './layers.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Rota `/despesas` (T-009): total do mês + lista de despesas fixas agrupada
 * por categoria (sem barras de progresso) + form de adição + exclusão.
 * Consome `/api/expenses` (T-006/T-007) via `web/src/api.ts`. Header com
 * mascote e título/subtítulo do layer já vêm do shell (T-004).
 */
export function DespesasPage() {
  const [expenses, setExpenses] = useState<FixedExpense[] | 'loading' | 'error'>('loading');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function refresh() {
    setExpenses('loading');
    try {
      const data = await getFixedExpenses();
      setExpenses(data);
    } catch {
      setExpenses('error');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const list = Array.isArray(expenses) ? expenses : [];
  const total = list.reduce((acc, e) => acc + e.amount, 0);
  const groups = groupByCategory(list);

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

  return (
    <div>
      <div className="vw-page-header">
        <h1 className="vw-page-title">Despesas</h1>
        <p className="vw-page-subtitle">Gastos por categoria</p>
      </div>

      <div className="vw-hero-card">
        <p className="vw-hero-total-label">Total do mês</p>
        <p className="vw-hero-total-value">{fmtCur.format(total)}</p>
      </div>

      <div className="vw-layerpage-grid">
        <div className="vw-layerpage-card">
          <h2 className="vw-layerpage-card-title">Despesas fixas</h2>

          {expenses === 'loading' && <p className="vw-layerpage-state">Carregando…</p>}
          {expenses === 'error' && (
            <p className="vw-layerpage-error">Não foi possível carregar suas despesas.</p>
          )}
          {Array.isArray(expenses) && expenses.length === 0 && (
            <p className="vw-layerpage-state">Nenhuma despesa cadastrada ainda.</p>
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
          <h2 className="vw-layerpage-card-title">Nova despesa</h2>
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
      </div>
    </div>
  );
}
