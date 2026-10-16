import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  getFixedIncome,
  createFixedIncomePosition,
  updateFixedIncomePosition,
  deleteFixedIncomePosition,
} from '../api';
import type { FixedIncomePosition } from '@vetor-wallet/shared';
import {
  EMPTY_FIXED_INCOME_FORM,
  FIXED_INCOME_KINDS,
  FIXED_INCOME_KIND_LABEL,
  FIXED_INCOME_RATE_TYPES,
  FIXED_INCOME_RATE_TYPE_LABEL,
  displayValue,
  maturityLabel,
  parseFixedIncomeForm,
  rateLabel,
  sortByMaturity,
  toFormValues,
  totalDisplayValueCents,
  totalInvestedCents,
  type FixedIncomeFormValues,
} from './fixedIncome';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { BackToHomeLink } from '../components/BackToHomeLink';
import { mascotSrcForLayer } from '../layout/mascots';
import './layers.css';
import './layers-savings.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Rota `/investimentos/renda-fixa` (T-091c/d, fatia c2): posições manuais de
 * renda fixa (caixinha/CDB/LCI/LCA/Tesouro/debênture/CRI-CRA/outro) —
 * `GET/POST/PATCH/DELETE /api/fixed-income` (backend da fatia c1).
 *
 * **O valor exibido NUNCA é estimado a partir da taxa** (decisão do humano,
 * registrada em `fixedIncome.ts`): é sempre `current_value` (saldo que o
 * usuário leu no extrato/app do banco) quando informado, senão
 * `invested_amount`. A lista deixa isso explícito com "Saldo informado em
 * DD/MM/AAAA" vs. "Valor aplicado em DD/MM/AAAA" — a UI nunca sugere que o
 * número está "rendendo" ou foi atualizado automaticamente.
 *
 * Mesmo molde de `PoupancaPage`: resumo → form atrás de `CollapsibleSection`
 * → lista com edição inline (lápis → campos → salvar/cancelar) e exclusão com
 * confirmação (`window.confirm`, mesmo padrão de `OperationsList`).
 */
export function RendaFixaPage() {
  const [positions, setPositions] = useState<FixedIncomePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState<FixedIncomeFormValues>(EMPTY_FIXED_INCOME_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<FixedIncomeFormValues | null>(null);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const data = await getFixedIncome();
      setPositions(data.positions);
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

    const result = parseFixedIncomeForm(form);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    setSubmitting(true);
    try {
      await createFixedIncomePosition(result.payload);
      setForm(EMPTY_FIXED_INCOME_FORM);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar posição');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(position: FixedIncomePosition) {
    setEditingId(position.id);
    setEditDraft(toFormValues(position));
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditError('');
  }

  async function handleEditSubmit(e: FormEvent, id: number) {
    e.preventDefault();
    if (!editDraft) return;
    setEditError('');

    const result = parseFixedIncomeForm(editDraft);
    if (!result.ok) {
      setEditError(result.error);
      return;
    }

    setSavingEdit(true);
    try {
      await updateFixedIncomePosition(id, {
        name: result.payload.name,
        kind: result.payload.kind,
        institution: result.payload.institution ?? '',
        investedAmount: result.payload.investedAmount,
        investedAt: result.payload.investedAt,
        maturityDate: result.payload.maturityDate,
        rateType: result.payload.rateType,
        rate: result.payload.rate,
        currentValue: result.payload.currentValue,
        currentValueDate: result.payload.currentValueDate,
      });
      await refresh();
      cancelEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Falha ao atualizar posição');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(position: FixedIncomePosition) {
    if (!window.confirm(`Remover a posição "${position.name}"?`)) return;
    setError('');
    try {
      await deleteFixedIncomePosition(position.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover posição');
    }
  }

  const sorted = sortByMaturity(positions);
  const totalInvested = totalInvestedCents(positions) / 100;
  const totalCurrent = totalDisplayValueCents(positions) / 100;

  return (
    <div>
      <BackToHomeLink />
      <div className="vw-page-header-row">
        <div className="vw-page-header">
          <h1 className="vw-page-title">Renda Fixa</h1>
          <p className="vw-page-subtitle">Caixinhas, CDB, LCI/LCA, Tesouro e outros</p>
        </div>
        <img
          src={mascotSrcForLayer('renda-fixa')}
          alt=""
          className="vw-page-mascot"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      </div>

      {loading ? (
        <div className="vw-state-box">Carregando...</div>
      ) : error ? (
        <div className="vw-state-box vw-state-error">{error}</div>
      ) : (
        <>
          <div className="vw-savings-summary">
            <div className="vw-savings-summary-card">
              <p className="vw-savings-summary-label">Valor aplicado</p>
              <p className="vw-savings-summary-value">{fmtCur.format(totalInvested)}</p>
            </div>
            <div className="vw-savings-summary-card">
              <p className="vw-savings-summary-label">Valor atual</p>
              <p className="vw-savings-summary-value">{fmtCur.format(totalCurrent)}</p>
              <p className="vw-savings-summary-sub">
                Saldo informado quando houver; senão, o valor aplicado. Não é uma estimativa de
                rendimento.
              </p>
            </div>
          </div>

          <CollapsibleSection label="Nova posição" openLabel="Nova posição">
            <form onSubmit={handleSubmit}>
              <div className="vw-form-grid">
                <div className="vw-form-field">
                  <label htmlFor="fi-name">Nome</label>
                  <input
                    id="fi-name"
                    type="text"
                    placeholder="Ex.: CDB Banco X"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="fi-kind">Tipo</label>
                  <select
                    id="fi-kind"
                    value={form.kind}
                    onChange={(e) =>
                      setForm({ ...form, kind: e.target.value as FixedIncomeFormValues['kind'] })
                    }
                  >
                    {FIXED_INCOME_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {FIXED_INCOME_KIND_LABEL[kind]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="vw-form-field">
                  <label htmlFor="fi-institution">Instituição (opcional)</label>
                  <input
                    id="fi-institution"
                    type="text"
                    placeholder="Ex.: Banco X"
                    value={form.institution}
                    onChange={(e) => setForm({ ...form, institution: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="fi-invested-amount">Valor aplicado (R$)</label>
                  <input
                    id="fi-invested-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.investedAmount}
                    onChange={(e) => setForm({ ...form, investedAmount: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="fi-invested-at">Data da aplicação</label>
                  <input
                    id="fi-invested-at"
                    type="date"
                    value={form.investedAt}
                    onChange={(e) => setForm({ ...form, investedAt: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="fi-maturity">Vencimento (vazio = liquidez diária)</label>
                  <input
                    id="fi-maturity"
                    type="date"
                    value={form.maturityDate}
                    onChange={(e) => setForm({ ...form, maturityDate: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="fi-rate-type">Indexador</label>
                  <select
                    id="fi-rate-type"
                    value={form.rateType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rateType: e.target.value as FixedIncomeFormValues['rateType'],
                      })
                    }
                  >
                    {FIXED_INCOME_RATE_TYPES.map((rateType) => (
                      <option key={rateType} value={rateType}>
                        {FIXED_INCOME_RATE_TYPE_LABEL[rateType]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="vw-form-field">
                  <label htmlFor="fi-rate">Taxa</label>
                  <input
                    id="fi-rate"
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex.: 110"
                    value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="fi-current-value">Saldo informado (opcional, R$)</label>
                  <input
                    id="fi-current-value"
                    type="text"
                    inputMode="decimal"
                    placeholder="Opcional"
                    value={form.currentValue}
                    onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="fi-current-value-date">Data do saldo informado</label>
                  <input
                    id="fi-current-value-date"
                    type="date"
                    value={form.currentValueDate}
                    onChange={(e) => setForm({ ...form, currentValueDate: e.target.value })}
                  />
                </div>
              </div>
              <span className="vw-field-hint">
                O saldo informado é o que você leu no extrato/app do banco — o app nunca estima
                rendimento a partir da taxa. Preencha os dois campos juntos, ou nenhum.
              </span>
              <div className="vw-form-actions">
                <button type="submit" className="vw-btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando...' : 'Adicionar posição'}
                </button>
              </div>
              {formError && <p className="vw-form-error">{formError}</p>}
            </form>
          </CollapsibleSection>

          {sorted.length === 0 ? (
            <div className="vw-state-box">Nenhuma posição de renda fixa cadastrada ainda.</div>
          ) : (
            <div className="vw-savings-list">
              {sorted.map((position) =>
                editingId === position.id && editDraft ? (
                  <form
                    className="vw-layerpage-item-edit"
                    key={position.id}
                    onSubmit={(e) => handleEditSubmit(e, position.id)}
                  >
                    <div className="vw-layerpage-edit-grid">
                      <div className="vw-layerpage-field">
                        <label htmlFor={`fi-edit-name-${position.id}`}>Nome</label>
                        <input
                          id={`fi-edit-name-${position.id}`}
                          type="text"
                          value={editDraft.name}
                          disabled={savingEdit}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        />
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`fi-edit-kind-${position.id}`}>Tipo</label>
                        <select
                          id={`fi-edit-kind-${position.id}`}
                          value={editDraft.kind}
                          disabled={savingEdit}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              kind: e.target.value as FixedIncomeFormValues['kind'],
                            })
                          }
                        >
                          {FIXED_INCOME_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {FIXED_INCOME_KIND_LABEL[kind]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`fi-edit-invested-amount-${position.id}`}>
                          Valor aplicado (R$)
                        </label>
                        <input
                          id={`fi-edit-invested-amount-${position.id}`}
                          type="text"
                          inputMode="decimal"
                          value={editDraft.investedAmount}
                          disabled={savingEdit}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, investedAmount: e.target.value })
                          }
                        />
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`fi-edit-invested-at-${position.id}`}>
                          Data da aplicação
                        </label>
                        <input
                          id={`fi-edit-invested-at-${position.id}`}
                          type="date"
                          value={editDraft.investedAt}
                          disabled={savingEdit}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, investedAt: e.target.value })
                          }
                        />
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`fi-edit-maturity-${position.id}`}>Vencimento</label>
                        <input
                          id={`fi-edit-maturity-${position.id}`}
                          type="date"
                          value={editDraft.maturityDate}
                          disabled={savingEdit}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, maturityDate: e.target.value })
                          }
                        />
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`fi-edit-rate-type-${position.id}`}>Indexador</label>
                        <select
                          id={`fi-edit-rate-type-${position.id}`}
                          value={editDraft.rateType}
                          disabled={savingEdit}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              rateType: e.target.value as FixedIncomeFormValues['rateType'],
                            })
                          }
                        >
                          {FIXED_INCOME_RATE_TYPES.map((rateType) => (
                            <option key={rateType} value={rateType}>
                              {FIXED_INCOME_RATE_TYPE_LABEL[rateType]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`fi-edit-rate-${position.id}`}>Taxa</label>
                        <input
                          id={`fi-edit-rate-${position.id}`}
                          type="text"
                          inputMode="decimal"
                          value={editDraft.rate}
                          disabled={savingEdit}
                          onChange={(e) => setEditDraft({ ...editDraft, rate: e.target.value })}
                        />
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`fi-edit-current-value-${position.id}`}>
                          Saldo informado (opcional)
                        </label>
                        <input
                          id={`fi-edit-current-value-${position.id}`}
                          type="text"
                          inputMode="decimal"
                          value={editDraft.currentValue}
                          disabled={savingEdit}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, currentValue: e.target.value })
                          }
                        />
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`fi-edit-current-value-date-${position.id}`}>
                          Data do saldo informado
                        </label>
                        <input
                          id={`fi-edit-current-value-date-${position.id}`}
                          type="date"
                          value={editDraft.currentValueDate}
                          disabled={savingEdit}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, currentValueDate: e.target.value })
                          }
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
                ) : (
                  <div className="vw-savings-entry-row" key={position.id}>
                    <span className="vw-savings-entry-badge vw-badge-deposit">
                      {FIXED_INCOME_KIND_LABEL[position.kind]}
                    </span>
                    <div className="vw-savings-entry-main">
                      <p className="vw-savings-entry-note">
                        {position.name}
                        {position.institution ? ` · ${position.institution}` : ''}
                      </p>
                      <p className="vw-savings-entry-date">
                        {maturityLabel(position.maturity_date, todayIso())} ·{' '}
                        {rateLabel(position.rate_type, position.rate)} ·{' '}
                        {position.current_value !== null
                          ? `Saldo informado em ${formatDate(position.current_value_date as string)}`
                          : `Valor aplicado em ${formatDate(position.invested_at)}`}
                      </p>
                    </div>
                    <span className="vw-savings-entry-amount">
                      {fmtCur.format(displayValue(position))}
                    </span>
                    <button
                      type="button"
                      className="vw-layerpage-edit-btn"
                      onClick={() => startEdit(position)}
                      disabled={editingId !== null}
                      aria-label="Editar posição"
                      title="Editar posição"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="vw-delete-btn"
                      onClick={() => handleDelete(position)}
                      disabled={editingId !== null}
                      aria-label="Remover posição"
                      title="Remover posição"
                    >
                      ×
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
