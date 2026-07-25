import { useEffect, useState } from 'react';
import {
  createIncomeSource,
  deleteIncomeSource,
  getIncomeSources,
  updateIncomeSource,
} from '../api';
import type { IncomeSource, IncomeSourceType, IncomeSourceUpdate } from '@vetor-wallet/shared';
import { diffEditableFields, hasEdits, parseMoneyInput } from './inlineEdit';
import './layers.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const TYPE_LABELS: Record<IncomeSourceType, string> = {
  SALARIO: 'Salário',
  FREELA: 'Freelance',
  OUTRO: 'Outro',
};

/** Campos editáveis de uma fonte de renda, na representação do form (T-031). */
interface EditDraft {
  name: string;
  type: IncomeSourceType;
  amount: string;
}

function toDraft(source: IncomeSource): EditDraft {
  return { name: source.name, type: source.type, amount: String(source.amount) };
}

/**
 * Rota `/renda` (T-009): total do mês (soma das fontes) + lista de fontes de
 * renda (nome, tipo, valor) + form de adição + exclusão. Consome
 * `/api/income` (T-006/T-007) via `web/src/api.ts`. Header com mascote e
 * título/subtítulo do layer já vêm do shell (T-004) — aqui só o conteúdo.
 *
 * T-031: cada item da lista tem modo de edição (lápis → campos preenchidos →
 * salvar/cancelar) que dispara `PATCH /api/income/:id` só com os campos
 * alterados.
 */
export function RendaPage() {
  const [sources, setSources] = useState<IncomeSource[] | 'loading' | 'error'>('loading');
  const [name, setName] = useState('');
  const [type, setType] = useState<IncomeSourceType>('SALARIO');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function refresh() {
    setSources('loading');
    try {
      const data = await getIncomeSources();
      setSources(data);
    } catch {
      setSources('error');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const list = Array.isArray(sources) ? sources : [];
  const total = list.reduce((acc, s) => acc + s.amount, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!name.trim()) {
      setFormError('Informe um nome para a fonte de renda.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Informe um valor válido maior que zero.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createIncomeSource({ name: name.trim(), type, amount: parsedAmount });
      setSources((prev) => (Array.isArray(prev) ? [created, ...prev] : [created]));
      setName('');
      setAmount('');
      setType('SALARIO');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar fonte de renda');
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

  return (
    <div>
      <div className="vw-page-header">
        <h1 className="vw-page-title">Renda</h1>
        <p className="vw-page-subtitle">Fontes de receita do mês</p>
      </div>

      <div className="vw-hero-card">
        <p className="vw-hero-total-label">Total do mês</p>
        <p className="vw-hero-total-value">{fmtCur.format(total)}</p>
      </div>

      <div className="vw-layerpage-grid">
        <div className="vw-layerpage-card">
          <h2 className="vw-layerpage-card-title">Fontes de renda</h2>

          {sources === 'loading' && <p className="vw-layerpage-state">Carregando…</p>}
          {sources === 'error' && (
            <p className="vw-layerpage-error">Não foi possível carregar suas fontes de renda.</p>
          )}
          {Array.isArray(sources) && sources.length === 0 && (
            <p className="vw-layerpage-state">Nenhuma fonte de renda cadastrada ainda.</p>
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
        </div>

        <div className="vw-layerpage-card">
          <h2 className="vw-layerpage-card-title">Nova fonte de renda</h2>
          <form className="vw-layerpage-form" onSubmit={handleSubmit}>
            <div className="vw-layerpage-field">
              <label htmlFor="renda-nome">Nome</label>
              <input
                id="renda-nome"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Salário CLT"
              />
            </div>
            <div className="vw-layerpage-field">
              <label htmlFor="renda-tipo">Tipo</label>
              <select id="renda-tipo" value={type} onChange={(e) => setType(e.target.value as IncomeSourceType)}>
                <option value="SALARIO">Salário</option>
                <option value="FREELA">Freelance</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            <div className="vw-layerpage-field">
              <label htmlFor="renda-valor">Valor</label>
              <input
                id="renda-valor"
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
