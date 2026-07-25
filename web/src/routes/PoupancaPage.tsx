import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getSavings, createSavingsEntry, deleteSavingsEntry, getGoals } from '../api';
import type { Goal, SavingsEntry, SavingsEntryType, SavingsSummary } from '@vetor-wallet/shared';
import './layers-savings.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const TYPE_LABEL: Record<SavingsEntryType, string> = {
  DEPOSIT: 'Aporte',
  WITHDRAW: 'Retirada',
  YIELD: 'Rendimento',
};

const TYPE_BADGE_CLASS: Record<SavingsEntryType, string> = {
  DEPOSIT: 'vw-badge-deposit',
  WITHDRAW: 'vw-badge-withdraw',
  YIELD: 'vw-badge-yield',
};

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  type: SavingsEntryType;
  amount: string;
  date: string;
  note: string;
  /** Id da meta a vincular, como string (valor do <select>); '' = sem vínculo. */
  goalId: string;
}

const EMPTY_FORM: FormState = { type: 'DEPOSIT', amount: '', date: todayIso(), note: '', goalId: '' };

/**
 * Rota `/poupanca` (T-010): saldo/aportes/rendimento vindos do `summary`
 * calculado pelo server (`GET /api/savings`) — sem recálculo no front —,
 * lista de lançamentos, form de novo lançamento e dica CDI estática.
 *
 * T-024: aporte/retirada podem ser vinculados a uma meta; a meta vinculada
 * passa a ter progresso derivado desses lançamentos. Rendimento (`YIELD`) não
 * aceita vínculo (o server rejeita com 400).
 */
export function PoupancaPage() {
  const [entries, setEntries] = useState<SavingsEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  // 'error' sinaliza que só a busca de metas falhou — o select de vínculo é
  // acessório (T-030): a tela inteira não deve cair por conta dele, então o
  // erro fica isolado deste estado em vez de derrubar `entries`/`summary`
  // junto num `Promise.all`.
  const [goalsStatus, setGoalsStatus] = useState<'ok' | 'error'>('ok');
  const [summary, setSummary] = useState<SavingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const data = await getSavings();
      setEntries(data.entries);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar com a API');
      setLoading(false);
      return;
    }

    try {
      setGoals(await getGoals());
      setGoalsStatus('ok');
    } catch {
      setGoals([]);
      setGoalsStatus('error');
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

    const amount = Number(form.amount.replace(',', '.'));
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      setFormError('Informe um valor válido, maior que zero.');
      return;
    }
    if (!form.date) {
      setFormError('Informe a data do lançamento.');
      return;
    }

    setSubmitting(true);
    try {
      await createSavingsEntry({
        type: form.type,
        amount,
        date: form.date,
        note: form.note.trim() || undefined,
        // YIELD não aceita vínculo com meta (T-024)
        goalId: form.type !== 'YIELD' && form.goalId ? Number(form.goalId) : undefined,
      });
      setForm({ ...EMPTY_FORM, date: form.date });
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar lançamento');
    } finally {
      setSubmitting(false);
    }
  }

  const goalNameById = new Map(goals.map((goal) => [goal.id, goal.name]));

  async function handleDelete(id: number) {
    try {
      await deleteSavingsEntry(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover lançamento');
    }
  }

  return (
    <div>
      <div className="vw-page-header">
        <h1 className="vw-page-title">Poupança</h1>
        <p className="vw-page-subtitle">Saldo, aportes e rendimento</p>
      </div>

      {loading ? (
        <div className="vw-state-box">Carregando...</div>
      ) : error ? (
        <div className="vw-state-box vw-state-error">{error}</div>
      ) : (
        <>
          <div className="vw-savings-summary">
            <div className="vw-savings-summary-card">
              <p className="vw-savings-summary-label">Saldo</p>
              <p className="vw-savings-summary-value">{fmtCur.format(summary?.balance ?? 0)}</p>
            </div>
            <div className="vw-savings-summary-card">
              <p className="vw-savings-summary-label">Total de aportes</p>
              <p className="vw-savings-summary-value vw-value-up">
                {fmtCur.format(summary?.totalDeposits ?? 0)}
              </p>
            </div>
            <div className="vw-savings-summary-card">
              <p className="vw-savings-summary-label">Rendimento</p>
              <p className="vw-savings-summary-value vw-value-up">
                {fmtCur.format(summary?.totalYield ?? 0)}
              </p>
            </div>
          </div>

          <div className="vw-cdi-tip">
            💡 <strong>Dica:</strong> reservas de emergência costumam render próximo de 100% do
            CDI em fundos/contas digitais com liquidez diária. Vale comparar a rentabilidade da
            sua poupança/reserva com o CDI do período em <code>/carteiras</code> antes de decidir
            entre manter o dinheiro parado ou investir.
          </div>

          <div className="vw-form-card">
            <p className="vw-form-title">Novo lançamento</p>
            <form onSubmit={handleSubmit}>
              <div className="vw-form-grid">
                <div className="vw-form-field">
                  <label htmlFor="savings-type">Tipo</label>
                  <select
                    id="savings-type"
                    value={form.type}
                    onChange={(e) => {
                      const type = e.target.value as SavingsEntryType;
                      setForm({ ...form, type, goalId: type === 'YIELD' ? '' : form.goalId });
                    }}
                  >
                    <option value="DEPOSIT">Aporte</option>
                    <option value="WITHDRAW">Retirada</option>
                    <option value="YIELD">Rendimento</option>
                  </select>
                </div>
                <div className="vw-form-field">
                  <label htmlFor="savings-amount">Valor (R$)</label>
                  <input
                    id="savings-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="savings-date">Data</label>
                  <input
                    id="savings-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="savings-note">Nota (opcional)</label>
                  <input
                    id="savings-note"
                    type="text"
                    placeholder="Ex.: 13º salário"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="savings-goal">Vincular à meta (opcional)</label>
                  {goalsStatus === 'error' ? (
                    // O select de metas é acessório (T-030): se só /api/goals falhar, os
                    // lançamentos e o form continuam funcionando normalmente (sem vínculo),
                    // com um aviso discreto no lugar do select em vez de derrubar a tela toda.
                    <p className="vw-field-hint vw-field-hint--warn">
                      Não foi possível carregar suas metas — lançamentos seguem sem vínculo.
                    </p>
                  ) : (
                    <>
                      <select
                        id="savings-goal"
                        value={form.goalId}
                        disabled={form.type === 'YIELD' || goals.length === 0}
                        onChange={(e) => setForm({ ...form, goalId: e.target.value })}
                      >
                        <option value="">Sem vínculo</option>
                        {goals.map((goal) => (
                          <option key={goal.id} value={String(goal.id)}>
                            {goal.name}
                          </option>
                        ))}
                      </select>
                      {form.type === 'YIELD' ? (
                        <span className="vw-field-hint">Rendimento não pode ser vinculado a meta.</span>
                      ) : goals.length === 0 ? (
                        <span className="vw-field-hint">Cadastre uma meta em /metas para vincular aportes.</span>
                      ) : (
                        <span className="vw-field-hint">
                          A meta vinculada passa a calcular o progresso por estes lançamentos.
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="vw-form-actions">
                <button type="submit" className="vw-btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando...' : 'Adicionar lançamento'}
                </button>
              </div>
              {formError && <p className="vw-form-error">{formError}</p>}
            </form>
          </div>

          {entries.length === 0 ? (
            <div className="vw-state-box">Nenhum lançamento registrado ainda.</div>
          ) : (
            <div className="vw-savings-list">
              {entries.map((entry) => (
                <div className="vw-savings-entry-row" key={entry.id}>
                  <span className={`vw-savings-entry-badge ${TYPE_BADGE_CLASS[entry.type]}`}>
                    {TYPE_LABEL[entry.type]}
                  </span>
                  <div className="vw-savings-entry-main">
                    <p className="vw-savings-entry-note">{entry.note || '—'}</p>
                    <p className="vw-savings-entry-date">
                      {formatDate(entry.date)}
                      {entry.goal_id != null && goalNameById.get(entry.goal_id) && (
                        <span className="vw-savings-entry-goal">🔗 {goalNameById.get(entry.goal_id)}</span>
                      )}
                    </p>
                  </div>
                  <span className="vw-savings-entry-amount">
                    {entry.type === 'WITHDRAW' ? '- ' : '+ '}
                    {fmtCur.format(entry.amount)}
                  </span>
                  <button
                    type="button"
                    className="vw-delete-btn"
                    onClick={() => handleDelete(entry.id)}
                    aria-label="Remover lançamento"
                    title="Remover lançamento"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
