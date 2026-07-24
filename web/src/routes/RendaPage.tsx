import { useEffect, useState } from 'react';
import { createIncomeSource, deleteIncomeSource, getIncomeSources } from '../api';
import type { IncomeSource, IncomeSourceType } from '@vetor-wallet/shared';
import './layers.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const TYPE_LABELS: Record<IncomeSourceType, string> = {
  SALARIO: 'Salário',
  FREELA: 'Freelance',
  OUTRO: 'Outro',
};

/**
 * Rota `/renda` (T-009): total do mês (soma das fontes) + lista de fontes de
 * renda (nome, tipo, valor) + form de adição + exclusão. Consome
 * `/api/income` (T-006/T-007) via `web/src/api.ts`. Header com mascote e
 * título/subtítulo do layer já vêm do shell (T-004) — aqui só o conteúdo.
 */
export function RendaPage() {
  const [sources, setSources] = useState<IncomeSource[] | 'loading' | 'error'>('loading');
  const [name, setName] = useState('');
  const [type, setType] = useState<IncomeSourceType>('SALARIO');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
              {sources.map((s) => (
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
                        className="vw-layerpage-delete-btn"
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        aria-label={`Remover ${s.name}`}
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
