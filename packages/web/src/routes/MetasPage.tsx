import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api';
import type { Goal } from '@vetor-wallet/shared';
import { progressPct, progressPctClamped, isDerivedProgress, progressSourceLabel } from './goalsProgress';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { BackToHomeLink } from '../components/BackToHomeLink';
import './layers-savings.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

interface FormState {
  name: string;
  target: string;
  current: string;
}

const EMPTY_FORM: FormState = { name: '', target: '', current: '' };

/**
 * Card individual de meta: barra de progresso (visualmente limitada a 100%,
 * mesmo que `current_amount` ultrapasse `target_amount`).
 *
 * T-024: metas com lançamentos de poupança vinculados têm progresso derivado
 * (aportes − retiradas vinculados) — nesses casos o campo de edição manual não
 * aparece, porque o server rejeita o PATCH de `current_amount` com 400.
 */
function GoalCard({ goal, onUpdate, onDelete }: {
  goal: Goal;
  onUpdate: (id: number, currentAmount: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(goal.current_amount));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const pct = progressPct(goal);
  const pctClamped = progressPctClamped(goal);
  const isComplete = pct >= 100;
  const derived = isDerivedProgress(goal);

  async function handleUpdate() {
    setErr('');
    const amount = Number(value.replace(',', '.'));
    if (Number.isNaN(amount) || amount < 0) {
      setErr('Valor inválido');
      return;
    }
    setSaving(true);
    try {
      await onUpdate(goal.id, amount);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao atualizar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vw-goal-card">
      <div className="vw-goal-header">
        <p className="vw-goal-name">{goal.name}</p>
        <button
          type="button"
          className="vw-delete-btn"
          onClick={() => onDelete(goal.id)}
          aria-label="Remover meta"
          title="Remover meta"
        >
          ×
        </button>
      </div>
      <p className="vw-goal-amounts">
        <strong>{fmtCur.format(goal.current_amount)}</strong> de {fmtCur.format(goal.target_amount)}
      </p>
      <div className="vw-goal-progress-track">
        <div
          className={`vw-goal-progress-fill${isComplete ? ' vw-goal-complete' : ''}`}
          style={{ width: `${pctClamped}%` }}
        />
      </div>
      <p className="vw-goal-progress-pct">{fmtPct.format(pctClamped)}% concluído</p>
      <p className={`vw-goal-source${derived ? ' vw-goal-source-auto' : ''}`}>
        {derived ? '🔗 ' : '✎ '}
        {progressSourceLabel(goal)}
      </p>
      {derived ? (
        <p className="vw-goal-source-hint">
          Valor calculado pelos lançamentos vinculados em <code>/poupanca</code>.
        </p>
      ) : (
        <div className="vw-goal-update-row">
          <input
            type="number"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Novo valor atual da meta"
          />
          <button type="button" className="vw-btn-ghost" onClick={handleUpdate} disabled={saving}>
            {saving ? 'Salvando...' : 'Atualizar'}
          </button>
        </div>
      )}
      {/*
        T-041: atalho para reservar para esta meta dinheiro que já está na
        poupança. O form vive em /poupanca (onde estão saldo livre e razão);
        aqui só levamos a meta pré-selecionada via query string.
      */}
      <Link className="vw-goal-transfer-link" to={`/poupanca?meta=${goal.id}`}>
        ⇄ Aportar da poupança
      </Link>
      {err && <p className="vw-form-error">{err}</p>}
    </div>
  );
}

/**
 * Rota `/metas` (T-010): lista de metas com progresso e form de criação.
 *
 * T-024: o progresso pode ser **manual** (PATCH pontual de `current_amount`)
 * ou **automático**, quando existem lançamentos de poupança vinculados à meta
 * — nesse caso o server calcula `current_amount` e recusa a edição manual.
 */
export function MetasPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const data = await getGoals();
      setGoals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar com a API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const target = Number(form.target.replace(',', '.'));
    const current = form.current.trim() ? Number(form.current.replace(',', '.')) : 0;
    if (!form.name.trim()) {
      setFormError('Informe o nome da meta.');
      return;
    }
    if (!form.target || Number.isNaN(target) || target <= 0) {
      setFormError('Informe um valor alvo válido, maior que zero.');
      return;
    }
    if (Number.isNaN(current) || current < 0) {
      setFormError('Valor atual inválido.');
      return;
    }

    setSubmitting(true);
    try {
      await createGoal({ name: form.name.trim(), target_amount: target, current_amount: current });
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar meta');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(id: number, currentAmount: number) {
    await updateGoal(id, { current_amount: currentAmount });
    await refresh();
  }

  async function handleDelete(id: number) {
    try {
      await deleteGoal(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover meta');
    }
  }

  return (
    <div>
      <BackToHomeLink />
      <div className="vw-page-header">
        <h1 className="vw-page-title">Metas</h1>
        <p className="vw-page-subtitle">Progresso dos seus objetivos</p>
      </div>

      {loading ? (
        <div className="vw-state-box">Carregando...</div>
      ) : error ? (
        <div className="vw-state-box vw-state-error">{error}</div>
      ) : (
        <>
          {goals.length === 0 ? (
            <div className="vw-state-box">Nenhuma meta cadastrada ainda.</div>
          ) : (
            <div className="vw-goals-list">
              {goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onUpdate={handleUpdate} onDelete={handleDelete} />
              ))}
            </div>
          )}

          <CollapsibleSection label="+ Nova meta" openLabel="Nova meta">
            <div className="vw-form-card">
              <form onSubmit={handleSubmit}>
                <div className="vw-form-grid">
                  <div className="vw-form-field">
                    <label htmlFor="goal-name">Nome</label>
                    <input
                      id="goal-name"
                      type="text"
                      placeholder="Ex.: Viagem"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="vw-form-field">
                    <label htmlFor="goal-target">Valor alvo (R$)</label>
                    <input
                      id="goal-target"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={form.target}
                      onChange={(e) => setForm({ ...form, target: e.target.value })}
                    />
                  </div>
                  <div className="vw-form-field">
                    <label htmlFor="goal-current">Valor atual (opcional)</label>
                    <input
                      id="goal-current"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={form.current}
                      onChange={(e) => setForm({ ...form, current: e.target.value })}
                    />
                  </div>
                </div>
                <div className="vw-form-actions">
                  <button type="submit" className="vw-btn-primary" disabled={submitting}>
                    {submitting ? 'Salvando...' : 'Criar meta'}
                  </button>
                </div>
                {formError && <p className="vw-form-error">{formError}</p>}
              </form>
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
