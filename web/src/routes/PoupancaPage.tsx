import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getSavings, createSavingsEntry, deleteSavingsEntry } from '../api';
import type { SavingsEntry, SavingsEntryType, SavingsSummary } from '@vetor-wallet/shared';
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
}

const EMPTY_FORM: FormState = { type: 'DEPOSIT', amount: '', date: todayIso(), note: '' };

/**
 * Rota `/poupanca` (T-010): saldo/aportes/rendimento vindos do `summary`
 * calculado pelo server (`GET /api/savings`) — sem recálculo no front —,
 * lista de lançamentos, form de novo lançamento e dica CDI estática.
 */
export function PoupancaPage() {
  const [entries, setEntries] = useState<SavingsEntry[]>([]);
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
      });
      setForm({ ...EMPTY_FORM, date: form.date });
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar lançamento');
    } finally {
      setSubmitting(false);
    }
  }

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
                    onChange={(e) => setForm({ ...form, type: e.target.value as SavingsEntryType })}
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
                    <p className="vw-savings-entry-date">{formatDate(entry.date)}</p>
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
