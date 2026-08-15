import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { getSavings, createSavingsEntry, deleteSavingsEntry, updateSavingsEntry } from '../api';
import type {
  SavingsEntry,
  SavingsEntryType,
  SavingsEntryUpdate,
  SavingsSummary,
} from '@vetor-wallet/shared';
import { diffEditableFields, hasEdits, parseMoneyInput } from './inlineEdit';
import {
  RATE_SAMPLE_MONTHS,
  deriveMonthlyRatePct,
  formatDecimalInput,
  parseMonthsInput,
  parseNonNegativeInput,
  projectSavings,
  shouldOpenProjectionAssumptions,
} from './savingsProjection';
import { isTransferLeg } from './savingsTransfer';
import { wouldOverdrawBalance } from './savingsWithdraw';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { BackToHomeLink } from '../components/BackToHomeLink';
import { mascotSrcForLayer } from '../layout/mascots';
import './layers.css';
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

const EMPTY_FORM: FormState = {
  type: 'DEPOSIT',
  amount: '',
  date: todayIso(),
  note: '',
};

/** Prazo inicial do simulador de rendimento (T-040), em meses. */
const DEFAULT_SIM_MONTHS = '12';

interface SimState {
  /** Valor inicial em reais (texto do input; aceita vírgula decimal). */
  initial: string;
  /** Taxa mensal em pontos percentuais (texto do input). */
  ratePct: string;
  /** Prazo em meses (texto do input). */
  months: string;
  /**
   * Aporte mensal recorrente em reais (T-062), opcional: campo **vazio = 0**
   * (sem aporte). Não tem default derivado — nasce vazio e por isso fica fora
   * do `simTouched`.
   */
  contribution: string;
}

/** Rascunho de edição de um lançamento (T-031), na forma do `FormState`. */
function toDraft(entry: SavingsEntry): FormState {
  return {
    type: entry.type,
    amount: String(entry.amount),
    date: entry.date,
    note: entry.note,
  };
}

/**
 * Rota `/poupanca` (T-010): saldo/aportes/rendimento vindos do `summary`
 * calculado pelo server (`GET /api/savings`) — sem recálculo no front —,
 * lista de lançamentos, form de novo lançamento e dica CDI estática.
 *
 * T-091b1: Metas foi removida do app (decisão do humano). Saíram daqui o
 * vínculo do lançamento com meta (T-024), o card "Transferir para uma meta"
 * (T-041), o deep-link `?meta=<id>` e o card "Saldo livre" — sem reserva, o
 * saldo livre É o saldo, e um segundo card repetiria o primeiro. O selo `⇄`
 * fica: pares gravados antes da remoção continuam no banco.
 *
 * T-031: cada lançamento tem modo de edição (lápis → campos preenchidos →
 * salvar/cancelar) via `PATCH /api/savings/:id`; salvar refaz o fetch
 * (`refresh`), que atualiza também o `summary`.
 *
 * T-076: a página abre em modo consulta — cards de resumo → previsão de
 * rendimento (renderizada automaticamente com os defaults: valor inicial =
 * saldo, taxa sugerida do histórico, prazo 12 meses) → lançamentos. "Novo
 * lançamento" fica atrás de `CollapsibleSection` (padrão da T-074), e os
 * inputs da previsão ficam numa área "Ajustar premissas" também recolhível —
 * sincronizada (via `useEffect`, controlada, uma única vez após o primeiro
 * fetch) para abrir só quando não há taxa derivada do histórico
 * (`shouldOpenProjectionAssumptions`), caso em que o usuário precisa digitar
 * a taxa manualmente.
 */
export function PoupancaPage() {
  const [entries, setEntries] = useState<SavingsEntry[]>([]);
  const [summary, setSummary] = useState<SavingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // T-079: aviso não-bloqueante quando um WITHDRAW deixaria o saldo negativo
  // (o server aceita — decisão documentada em `packages/savings-core/CLAUDE.md`;
  // a UI só avisa antes do POST). Passo de confirmação inline, sem `window.confirm`
  // (a página ainda não tinha padrão próprio de confirmação): fica mais
  // simples de testar e mais consistente com o resto do form.
  const [overdrawConfirmPending, setOverdrawConfirmPending] = useState(false);

  // Simulador de previsão de rendimento (T-040) — 100% client-side, nada é
  // persistido e nenhum endpoint novo é chamado.
  const [sim, setSim] = useState<SimState>({
    initial: '',
    ratePct: '',
    months: DEFAULT_SIM_MONTHS,
    contribution: '',
  });
  // Enquanto o usuário não mexer no campo, ele acompanha o default derivado
  // (saldo do `summary` / taxa do histórico), que só chega depois do fetch.
  const [simTouched, setSimTouched] = useState({ initial: false, ratePct: false });

  // T-076: "Ajustar premissas" (inputs da previsão) precisa ser CONTROLADA,
  // não uncontrolled com `defaultOpen` — `entries` nasce `[]` e só é
  // preenchido pelo `refresh()` assíncrono, então `derivedRatePct` no
  // primeiríssimo render é sempre `null`; um `defaultOpen` calculado ali
  // congelaria a seção aberta (via `useState` interno do
  // `CollapsibleSection`) mesmo depois que os dados chegarem e a taxa
  // derivada passar a existir. O `useEffect` logo abaixo (perto de
  // `derivedRatePct`) sincroniza `assumptionsOpen` com o dado real assim que
  // o primeiro fetch termina (`!loading`), e só UMA vez — `assumptionsSynced`
  // trava a sincronização depois disso para não fechar/abrir a seção por
  // cima de um toggle manual do usuário. Mesmo cuidado do `simTouched` para
  // os inputs da projeção.
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [assumptionsSynced, setAssumptionsSynced] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<FormState | null>(null);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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

    // T-079: WITHDRAW acima do saldo é aceito pelo server (decisão
    // documentada), mas pede confirmação inline antes do POST — evita que um
    // erro de digitação zere/negative o saldo em silêncio. `overdrawConfirmPending`
    // só é setado depois que o usuário já viu o aviso e confirmou; qualquer
    // edição no form volta o estado para "sem confirmação" (ver `updateForm`).
    if (
      form.type === 'WITHDRAW' &&
      !overdrawConfirmPending &&
      wouldOverdrawBalance(amount, summary?.balance ?? 0)
    ) {
      setOverdrawConfirmPending(true);
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
      setOverdrawConfirmPending(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar lançamento');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Atualiza `form` e derruba a confirmação pendente de saque acima do saldo
   * (T-079): qualquer edição depois do aviso (tipo, valor, etc.) invalida a
   * confirmação anterior — ela vale só para os dados exatos que o usuário viu.
   */
  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setOverdrawConfirmPending(false);
  }

  const derivedRatePct = useMemo(() => deriveMonthlyRatePct(entries), [entries]);

  // T-076: sincroniza "Ajustar premissas" com o dado real assim que o
  // primeiro fetch termina (`!loading`), UMA única vez — depois disso o
  // usuário controla o toggle livremente (não fecha/abre por cima dele).
  useEffect(() => {
    if (loading || assumptionsSynced) return;
    setAssumptionsOpen(shouldOpenProjectionAssumptions(derivedRatePct));
    setAssumptionsSynced(true);
  }, [loading, derivedRatePct, assumptionsSynced]);

  useEffect(() => {
    if (!summary || simTouched.initial) return;
    setSim((prev) => ({ ...prev, initial: formatDecimalInput(summary.balance, 2) }));
  }, [summary, simTouched.initial]);

  useEffect(() => {
    if (simTouched.ratePct) return;
    setSim((prev) => ({
      ...prev,
      ratePct: derivedRatePct !== null ? formatDecimalInput(derivedRatePct, 4) : '',
    }));
  }, [derivedRatePct, simTouched.ratePct]);

  const simInitial = parseNonNegativeInput(sim.initial);
  const simRate = parseNonNegativeInput(sim.ratePct);
  const simMonths = parseMonthsInput(sim.months);
  // T-062: aporte é OPCIONAL — campo vazio significa "sem aporte" (0), não
  // entrada inválida. `parseNonNegativeInput` devolve `null` tanto para vazio
  // quanto para lixo digitado, então só o texto em branco vira 0; qualquer
  // outro `null` continua invalidando a projeção (mesmo tratamento dos outros
  // campos).
  const simContributionRaw = sim.contribution.trim();
  const simContribution = simContributionRaw === '' ? 0 : parseNonNegativeInput(simContributionRaw);
  const projection =
    simInitial !== null && simRate !== null && simMonths !== null && simContribution !== null
      ? projectSavings(simInitial, simRate, simMonths, simContribution)
      : null;

  function startEdit(entry: SavingsEntry) {
    setEditingId(entry.id);
    setEditDraft(toDraft(entry));
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditError('');
  }

  async function handleEditSubmit(e: FormEvent, entry: SavingsEntry) {
    e.preventDefault();
    if (!editDraft) return;
    setEditError('');

    const parsedAmount = parseMoneyInput(editDraft.amount);
    if (parsedAmount === null) {
      setEditError('Informe um valor válido, maior que zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDraft.date)) {
      setEditError('Informe a data do lançamento.');
      return;
    }

    const diff = diffEditableFields(toDraft(entry), {
      type: editDraft.type,
      amount: String(parsedAmount),
      date: editDraft.date,
      note: editDraft.note.trim(),
    });
    if (!hasEdits(diff)) {
      cancelEdit();
      return;
    }

    const update: SavingsEntryUpdate = {};
    if (diff.type !== undefined) update.type = diff.type;
    if (diff.amount !== undefined) update.amount = parsedAmount;
    if (diff.date !== undefined) update.date = diff.date;
    if (diff.note !== undefined) update.note = diff.note;

    setSavingEdit(true);
    try {
      await updateSavingsEntry(entry.id, update);
      // O `summary` é derivado no server — refaz o fetch em vez de recalcular
      // no cliente.
      await refresh();
      cancelEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Falha ao atualizar lançamento');
    } finally {
      setSavingEdit(false);
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
      <BackToHomeLink />
      <div className="vw-page-header-row">
        <div className="vw-page-header">
          <h1 className="vw-page-title">Poupança</h1>
          <p className="vw-page-subtitle">Saldo, aportes e rendimento</p>
        </div>
        <img
          src={mascotSrcForLayer('poupanca')}
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
            {/*
              T-091b1: o 4º card "Saldo livre" saiu com Metas. Sem reserva, ele
              exibiria exatamente o mesmo número do card "Saldo".
            */}
          </div>

          <div className="vw-cdi-tip">
            💡 <strong>Dica:</strong> reservas de emergência costumam render próximo de 100% do CDI
            em fundos/contas digitais com liquidez diária. Vale comparar a rentabilidade da sua
            poupança/reserva com o CDI do período em <code>/dash</code> antes de decidir entre
            manter o dinheiro parado ou investir.
          </div>

          {/*
            Previsão de rendimento (T-040): simulação de juros compostos sobre o
            valor inicial, recalculada a cada tecla. T-062: com aporte mensal
            recorrente opcional (anuidade ordinária — o aporte entra no fim de
            cada mês). Segue sem gráfico (decisão do humano).
            T-076: renderiza automaticamente com os defaults (valor inicial =
            saldo, taxa sugerida do histórico, prazo 12); os inputs ficam numa
            área "Ajustar premissas" recolhível.
          */}
          <div className="vw-form-card">
            <p className="vw-form-title">Previsão de rendimento</p>

            <CollapsibleSection
              label="Ajustar premissas"
              openLabel="Ajustar premissas"
              open={assumptionsOpen}
              onOpenChange={setAssumptionsOpen}
            >
              <div className="vw-form-grid">
                <div className="vw-layerpage-field">
                  <label htmlFor="sim-initial">Valor inicial (R$)</label>
                  <input
                    id="sim-initial"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={sim.initial}
                    onChange={(e) => {
                      setSimTouched((prev) => ({ ...prev, initial: true }));
                      setSim({ ...sim, initial: e.target.value });
                    }}
                  />
                </div>
                <div className="vw-layerpage-field">
                  <label htmlFor="sim-rate">Taxa mensal (%)</label>
                  <input
                    id="sim-rate"
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex.: 0,9"
                    value={sim.ratePct}
                    onChange={(e) => {
                      setSimTouched((prev) => ({ ...prev, ratePct: true }));
                      setSim({ ...sim, ratePct: e.target.value });
                    }}
                  />
                </div>
                <div className="vw-layerpage-field">
                  <label htmlFor="sim-months">Prazo (meses)</label>
                  <input
                    id="sim-months"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="12"
                    value={sim.months}
                    onChange={(e) => setSim({ ...sim, months: e.target.value })}
                  />
                </div>
                <div className="vw-layerpage-field">
                  <label htmlFor="sim-contribution">Aporte mensal (R$)</label>
                  <input
                    id="sim-contribution"
                    type="text"
                    inputMode="decimal"
                    placeholder="Opcional"
                    value={sim.contribution}
                    onChange={(e) => setSim({ ...sim, contribution: e.target.value })}
                  />
                </div>
              </div>

              <span className="vw-field-hint">
                {derivedRatePct !== null
                  ? `Taxa sugerida a partir dos seus rendimentos dos últimos ${RATE_SAMPLE_MONTHS} meses com lançamento — ajuste à vontade.`
                  : 'Sem histórico de rendimento suficiente para sugerir uma taxa — informe a taxa mensal esperada (ex.: 0,9 para 0,9 %/mês).'}
              </span>
            </CollapsibleSection>

            {projection ? (
              <div className="vw-savings-projection">
                <div className="vw-savings-summary-card">
                  <p className="vw-savings-summary-label">Valor futuro</p>
                  <p className="vw-savings-summary-value">
                    {fmtCur.format(projection.futureValue)}
                  </p>
                  {projection.totalContributed > 0 && (
                    <p className="vw-savings-summary-sub">
                      Inclui {fmtCur.format(projection.totalContributed)} aportados no período.
                    </p>
                  )}
                </div>
                <div className="vw-savings-summary-card">
                  <p className="vw-savings-summary-label">
                    Rendimento em {simMonths} {simMonths === 1 ? 'mês' : 'meses'}
                  </p>
                  <p className="vw-savings-summary-value vw-value-up">
                    {fmtCur.format(projection.totalYield)}
                  </p>
                  {/* T-062: sem esta linha, o rendimento (que exclui os
                      aportes) parece pequeno demais para o valor futuro. */}
                  {projection.totalContributed > 0 && (
                    <p className="vw-savings-summary-sub">
                      Só os juros — os {fmtCur.format(projection.totalContributed)} aportados não
                      contam como rendimento.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="vw-field-hint vw-field-hint--warn">
                Informe valor inicial, taxa mensal e aporte mensal (todos ≥ 0, aporte opcional) e
                prazo em meses inteiro para ver a projeção.
              </p>
            )}
          </div>

          {/*
            Novo lançamento: atrás de `CollapsibleSection` (T-076) — consulta
            é ~10x mais frequente que lançar, mesmo espírito da T-074.
          */}
          <CollapsibleSection label="Novo lançamento" openLabel="Novo lançamento">
            <form onSubmit={handleSubmit}>
              <div className="vw-form-grid">
                <div className="vw-form-field">
                  <label htmlFor="savings-type">Tipo</label>
                  <select
                    id="savings-type"
                    value={form.type}
                    onChange={(e) => updateForm({ type: e.target.value as SavingsEntryType })}
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
                    onChange={(e) => updateForm({ amount: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="savings-date">Data</label>
                  <input
                    id="savings-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => updateForm({ date: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="savings-note">Nota (opcional)</label>
                  <input
                    id="savings-note"
                    type="text"
                    placeholder="Ex.: 13º salário"
                    value={form.note}
                    onChange={(e) => updateForm({ note: e.target.value })}
                  />
                </div>
              </div>
              {overdrawConfirmPending && (
                // T-079: aviso não-bloqueante — o server aceita WITHDRAW acima do
                // saldo (decisão documentada), então isto não impede o envio, só
                // confirma que a intenção é essa antes de deixar o saldo negativo.
                <p className="vw-field-hint vw-field-hint--warn" role="alert">
                  Esse valor deixa o saldo da poupança negativo. Clique em "Confirmar retirada" para
                  continuar mesmo assim.
                </p>
              )}
              <div className="vw-form-actions">
                <button type="submit" className="vw-btn-primary" disabled={submitting}>
                  {submitting
                    ? 'Salvando...'
                    : overdrawConfirmPending
                      ? 'Confirmar retirada'
                      : 'Adicionar lançamento'}
                </button>
                {overdrawConfirmPending && (
                  <button
                    type="button"
                    className="vw-btn-ghost"
                    onClick={() => setOverdrawConfirmPending(false)}
                  >
                    Cancelar
                  </button>
                )}
              </div>
              {formError && <p className="vw-form-error">{formError}</p>}
            </form>
          </CollapsibleSection>

          {entries.length === 0 ? (
            <div className="vw-state-box">Nenhum lançamento registrado ainda.</div>
          ) : (
            <div className="vw-savings-list">
              {entries.map((entry) =>
                editingId === entry.id && editDraft ? (
                  <form
                    className="vw-layerpage-item-edit"
                    key={entry.id}
                    onSubmit={(e) => handleEditSubmit(e, entry)}
                  >
                    <div className="vw-layerpage-edit-grid">
                      <div className="vw-layerpage-field">
                        <label htmlFor={`savings-edit-tipo-${entry.id}`}>Tipo</label>
                        <select
                          id={`savings-edit-tipo-${entry.id}`}
                          value={editDraft.type}
                          disabled={savingEdit}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              type: e.target.value as SavingsEntryType,
                            })
                          }
                        >
                          <option value="DEPOSIT">Aporte</option>
                          <option value="WITHDRAW">Retirada</option>
                          <option value="YIELD">Rendimento</option>
                        </select>
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`savings-edit-valor-${entry.id}`}>Valor (R$)</label>
                        <input
                          id={`savings-edit-valor-${entry.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={editDraft.amount}
                          disabled={savingEdit}
                          onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                        />
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`savings-edit-data-${entry.id}`}>Data</label>
                        <input
                          id={`savings-edit-data-${entry.id}`}
                          type="date"
                          value={editDraft.date}
                          disabled={savingEdit}
                          onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                        />
                      </div>
                      <div className="vw-layerpage-field">
                        <label htmlFor={`savings-edit-nota-${entry.id}`}>Nota</label>
                        <input
                          id={`savings-edit-nota-${entry.id}`}
                          type="text"
                          value={editDraft.note}
                          disabled={savingEdit}
                          onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
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
                  <div className="vw-savings-entry-row" key={entry.id}>
                    <span className={`vw-savings-entry-badge ${TYPE_BADGE_CLASS[entry.type]}`}>
                      {TYPE_LABEL[entry.type]}
                    </span>
                    <div className="vw-savings-entry-main">
                      <p className="vw-savings-entry-note">{entry.note || '—'}</p>
                      <p className="vw-savings-entry-date">
                        {formatDate(entry.date)}
                        {/*
                          T-041: selo nas DUAS pernas do par, no espírito do
                          `↻ recorrente` da T-035. É só procedência: cada perna
                          segue editável/excluível sozinha. T-091b1: dado
                          legado — a transferência saiu com Metas e nada novo
                          nasce com `transfer_group`.
                        */}
                        {isTransferLeg(entry) && (
                          <span
                            className="vw-savings-entry-transfer"
                            title="Perna de uma transferência antiga registrada na poupança"
                          >
                            ⇄ transferência
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="vw-savings-entry-amount">
                      {entry.type === 'WITHDRAW' ? '- ' : '+ '}
                      {fmtCur.format(entry.amount)}
                    </span>
                    <button
                      type="button"
                      className="vw-layerpage-edit-btn"
                      onClick={() => startEdit(entry)}
                      disabled={editingId !== null}
                      aria-label="Editar lançamento"
                      title="Editar lançamento"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="vw-delete-btn"
                      onClick={() => handleDelete(entry.id)}
                      disabled={editingId !== null}
                      aria-label="Remover lançamento"
                      title="Remover lançamento"
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
