import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getSavings,
  createSavingsEntry,
  deleteSavingsEntry,
  getGoals,
  updateSavingsEntry,
  transferSavingsToGoal,
} from '../api';
import type {
  Goal,
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
} from './savingsProjection';
import {
  computeFreeBalance,
  computeReservedTotal,
  isTransferLeg,
  validateTransfer,
} from './savingsTransfer';
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
  /** Id da meta a vincular, como string (valor do <select>); '' = sem vínculo. */
  goalId: string;
}

const EMPTY_FORM: FormState = { type: 'DEPOSIT', amount: '', date: todayIso(), note: '', goalId: '' };

/** Prazo inicial do simulador de rendimento (T-040), em meses. */
const DEFAULT_SIM_MONTHS = '12';

/** Form do card "Transferir para uma meta" (T-041). */
interface TransferState {
  /** Id da meta destino, como string (valor do `<select>`); '' = nenhuma. */
  goalId: string;
  amount: string;
  date: string;
  note: string;
}

const EMPTY_TRANSFER: TransferState = { goalId: '', amount: '', date: todayIso(), note: '' };

interface SimState {
  /** Valor inicial em reais (texto do input; aceita vírgula decimal). */
  initial: string;
  /** Taxa mensal em pontos percentuais (texto do input). */
  ratePct: string;
  /** Prazo em meses (texto do input). */
  months: string;
}

/**
 * Rascunho de edição de um lançamento (T-031). Mesma forma do `FormState` de
 * criação — `goalId` como string do `<select>`, `''` = sem vínculo.
 */
function toDraft(entry: SavingsEntry): FormState {
  return {
    type: entry.type,
    amount: String(entry.amount),
    date: entry.date,
    note: entry.note,
    goalId: entry.goal_id != null ? String(entry.goal_id) : '',
  };
}

/**
 * Rota `/poupanca` (T-010): saldo/aportes/rendimento vindos do `summary`
 * calculado pelo server (`GET /api/savings`) — sem recálculo no front —,
 * lista de lançamentos, form de novo lançamento e dica CDI estática.
 *
 * T-024: aporte/retirada podem ser vinculados a uma meta; a meta vinculada
 * passa a ter progresso derivado desses lançamentos. Rendimento (`YIELD`) não
 * aceita vínculo (o server rejeita com 400).
 *
 * T-031: cada lançamento tem modo de edição (lápis → campos preenchidos →
 * salvar/cancelar) via `PATCH /api/savings/:id`. Como o progresso da meta é
 * derivado na leitura, editar valor/tipo/vínculo já reflete na meta — por isso
 * o salvamento refaz o fetch (`refresh`), que também atualiza o `summary`.
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

  // Simulador de previsão de rendimento (T-040) — 100% client-side, nada é
  // persistido e nenhum endpoint novo é chamado.
  const [sim, setSim] = useState<SimState>({
    initial: '',
    ratePct: '',
    months: DEFAULT_SIM_MONTHS,
  });
  // Enquanto o usuário não mexer no campo, ele acompanha o default derivado
  // (saldo do `summary` / taxa do histórico), que só chega depois do fetch.
  const [simTouched, setSimTouched] = useState({ initial: false, ratePct: false });

  // Transferência poupança → meta (T-041): estado próprio, para não misturar
  // com o form de novo lançamento (validações e resposta são diferentes).
  const [transferForm, setTransferForm] = useState<TransferState>(EMPTY_TRANSFER);
  const [transferError, setTransferError] = useState('');
  const [transferring, setTransferring] = useState(false);

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

  const derivedRatePct = useMemo(() => deriveMonthlyRatePct(entries), [entries]);

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
  const projection =
    simInitial !== null && simRate !== null && simMonths !== null
      ? projectSavings(simInitial, simRate, simMonths)
      : null;

  const goalNameById = new Map(goals.map((goal) => [goal.id, goal.name]));

  // Nome da meta de cada par de transferência, para o selo poder nomear a meta
  // também na perna de saída — que, por invariante, NÃO tem `goal_id` (com as
  // duas pernas vinculadas o progresso da meta somaria +X −X = 0).
  const goalNameByTransferGroup = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      if (!entry.transfer_group || entry.goal_id == null) continue;
      const name = goalNameById.get(entry.goal_id);
      if (name) map.set(entry.transfer_group, name);
    }
    return map;
    // `goalNameById` é recriado a cada render; a dependência real é `goals`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, goals]);

  // T-041: o saldo NÃO muda com uma transferência (−X +X), então o saldo livre
  // é o único feedback visível de que o dinheiro foi reservado. `balance` vem do
  // `summary` do server; só a parcela reservada é derivada dos `entries`.
  const reservedTotal = useMemo(() => computeReservedTotal(entries), [entries]);
  const freeBalance = useMemo(
    () => computeFreeBalance(summary?.balance ?? 0, entries),
    [summary?.balance, entries],
  );
  // Bases legadas podem ter livre negativo (aporte vinculado anterior à T-041 +
  // retirada avulsa): exibir `max(0, …)` em vez de "-R$ …".
  const freeBalanceDisplay = Math.max(0, freeBalance);
  const canTransfer = goalsStatus === 'ok' && goals.length > 0 && freeBalance > 0;

  const transferGoal = goals.find((goal) => String(goal.id) === transferForm.goalId);
  // Aviso de UX: a primeira transferência converte a meta de MANUAL para
  // LINKED_SAVINGS, e aí o valor manual passa a ser ignorado pelo server (T-024)
  // — o progresso pode "cair" na tela. A regra do server não muda; só avisamos.
  const transferOverridesManual =
    transferGoal !== undefined &&
    (transferGoal.progress_source ?? 'MANUAL') === 'MANUAL' &&
    transferGoal.current_amount > 0;

  /** Pré-seleção via `/poupanca?meta=<id>` (link do card de /metas). */
  const [searchParams] = useSearchParams();
  const presetGoal = searchParams.get('meta');
  useEffect(() => {
    if (!presetGoal) return;
    if (!goals.some((goal) => String(goal.id) === presetGoal)) return;
    setTransferForm((prev) => (prev.goalId ? prev : { ...prev, goalId: presetGoal }));
  }, [presetGoal, goals]);

  async function handleTransferSubmit(e: FormEvent) {
    e.preventDefault();
    const validation = validateTransfer(transferForm.amount, transferForm.goalId, freeBalance);
    if (validation.error !== null) {
      setTransferError(validation.error);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transferForm.date)) {
      setTransferError('Informe a data da transferência.');
      return;
    }
    setTransferError('');

    setTransferring(true);
    try {
      await transferSavingsToGoal({
        goalId: Number(transferForm.goalId),
        amount: validation.amount,
        date: transferForm.date,
        note: transferForm.note.trim() || undefined,
      });
      setTransferForm({ ...EMPTY_TRANSFER, date: transferForm.date });
      // Saldo livre, lista e progresso das metas todos derivam do server.
      await refresh();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Falha ao transferir para a meta');
    } finally {
      setTransferring(false);
    }
  }

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
      // YIELD nunca fica vinculado (T-024): o select é limpo junto com a troca
      // de tipo, então virar rendimento desvincula explicitamente em vez de o
      // server rejeitar o PATCH com 400.
      goalId: editDraft.type === 'YIELD' ? '' : editDraft.goalId,
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
    // `''` no select significa "sem vínculo" → `null` desvincula no server.
    if (diff.goalId !== undefined) update.goalId = diff.goalId ? Number(diff.goalId) : null;

    setSavingEdit(true);
    try {
      await updateSavingsEntry(entry.id, update);
      // O `summary` e o progresso das metas são derivados no server — refaz o
      // fetch em vez de recalcular no cliente.
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
            {/*
              T-041: uma transferência para meta não muda o saldo (−X +X) — este
              card é o que mostra que o dinheiro ficou reservado.
            */}
            <div className="vw-savings-summary-card">
              <p className="vw-savings-summary-label">Saldo livre</p>
              <p className="vw-savings-summary-value">{fmtCur.format(freeBalanceDisplay)}</p>
              <p className="vw-savings-summary-sub">
                {fmtCur.format(reservedTotal)} reservados em metas
              </p>
            </div>
          </div>

          <div className="vw-cdi-tip">
            💡 <strong>Dica:</strong> reservas de emergência costumam render próximo de 100% do
            CDI em fundos/contas digitais com liquidez diária. Vale comparar a rentabilidade da
            sua poupança/reserva com o CDI do período em <code>/carteiras</code> antes de decidir
            entre manter o dinheiro parado ou investir.
          </div>

          {/*
            Transferir para uma meta (T-041): card dedicado, e não um checkbox no
            form de novo lançamento — a operação grava DUAS pernas, valida contra
            o saldo livre e não aceita tipo/rendimento.
          */}
          <div className="vw-form-card">
            <p className="vw-form-title">Transferir para uma meta</p>
            <form onSubmit={handleTransferSubmit}>
              <div className="vw-form-grid">
                <div className="vw-form-field">
                  <label htmlFor="transfer-goal">Meta</label>
                  <select
                    id="transfer-goal"
                    value={transferForm.goalId}
                    disabled={!canTransfer || transferring}
                    onChange={(e) => setTransferForm({ ...transferForm, goalId: e.target.value })}
                  >
                    <option value="">Escolha a meta</option>
                    {goals.map((goal) => (
                      <option key={goal.id} value={String(goal.id)}>
                        {goal.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="vw-form-field">
                  <label htmlFor="transfer-amount">Valor (R$)</label>
                  <input
                    id="transfer-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={transferForm.amount}
                    disabled={!canTransfer || transferring}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="transfer-date">Data</label>
                  <input
                    id="transfer-date"
                    type="date"
                    value={transferForm.date}
                    disabled={!canTransfer || transferring}
                    onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
                  />
                </div>
                <div className="vw-form-field">
                  <label htmlFor="transfer-note">Nota (opcional)</label>
                  <input
                    id="transfer-note"
                    type="text"
                    placeholder="Ex.: reserva da viagem"
                    value={transferForm.note}
                    disabled={!canTransfer || transferring}
                    onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
                  />
                </div>
              </div>

              {goalsStatus === 'error' ? (
                <span className="vw-field-hint vw-field-hint--warn">
                  Não foi possível carregar suas metas — tente recarregar a página para transferir.
                </span>
              ) : goals.length === 0 ? (
                <span className="vw-field-hint">
                  Cadastre uma meta em <code>/metas</code> para reservar parte da poupança para ela.
                </span>
              ) : freeBalance <= 0 ? (
                <span className="vw-field-hint vw-field-hint--warn">
                  Sem saldo livre: todo o dinheiro da poupança já está reservado em metas.
                </span>
              ) : (
                <span className="vw-field-hint">
                  O dinheiro continua na poupança rendendo — o saldo não muda, só passa a estar
                  reservado para a meta. Disponível: {fmtCur.format(freeBalanceDisplay)}.
                </span>
              )}

              {transferOverridesManual && (
                <span className="vw-field-hint vw-field-hint--warn">
                  Esta meta tem progresso preenchido à mão ({fmtCur.format(
                    transferGoal?.current_amount ?? 0,
                  )}
                  ). A partir da primeira transferência o progresso passa a ser calculado pelos
                  aportes vinculados, e o valor manual é ignorado.
                </span>
              )}

              <div className="vw-form-actions">
                <button
                  type="submit"
                  className="vw-btn-primary"
                  disabled={!canTransfer || transferring}
                >
                  {transferring ? 'Transferindo...' : 'Transferir da poupança'}
                </button>
              </div>
              {transferError && <p className="vw-form-error">{transferError}</p>}
            </form>
          </div>

          {/*
            Previsão de rendimento (T-040): simulação de juros compostos sobre o
            valor inicial, recalculada a cada tecla. Sem aporte mensal (fora de
            escopo) e sem gráfico (decisão do humano).
          */}
          <div className="vw-form-card">
            <p className="vw-form-title">Previsão de rendimento</p>
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
            </div>

            <span className="vw-field-hint">
              {derivedRatePct !== null
                ? `Taxa sugerida a partir dos seus rendimentos dos últimos ${RATE_SAMPLE_MONTHS} meses com lançamento — ajuste à vontade.`
                : 'Sem histórico de rendimento suficiente para sugerir uma taxa — informe a taxa mensal esperada (ex.: 0,9 para 0,9 %/mês).'}
            </span>

            {projection ? (
              <div className="vw-savings-projection">
                <div className="vw-savings-summary-card">
                  <p className="vw-savings-summary-label">Valor futuro</p>
                  <p className="vw-savings-summary-value">{fmtCur.format(projection.futureValue)}</p>
                </div>
                <div className="vw-savings-summary-card">
                  <p className="vw-savings-summary-label">
                    Rendimento em {simMonths} {simMonths === 1 ? 'mês' : 'meses'}
                  </p>
                  <p className="vw-savings-summary-value vw-value-up">
                    {fmtCur.format(projection.totalYield)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="vw-field-hint vw-field-hint--warn">
                Informe valor inicial, taxa mensal (ambos ≥ 0) e prazo em meses inteiro para ver a
                projeção.
              </p>
            )}
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
                          onChange={(e) => {
                            const type = e.target.value as SavingsEntryType;
                            setEditDraft({
                              ...editDraft,
                              type,
                              goalId: type === 'YIELD' ? '' : editDraft.goalId,
                            });
                          }}
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
                      <div className="vw-layerpage-field">
                        <label htmlFor={`savings-edit-meta-${entry.id}`}>Meta vinculada</label>
                        {goalsStatus === 'error' ? (
                          <p className="vw-field-hint vw-field-hint--warn">
                            Não foi possível carregar suas metas — o vínculo atual é mantido.
                          </p>
                        ) : (
                          <select
                            id={`savings-edit-meta-${entry.id}`}
                            value={editDraft.goalId}
                            disabled={savingEdit || editDraft.type === 'YIELD'}
                            onChange={(e) => setEditDraft({ ...editDraft, goalId: e.target.value })}
                          >
                            <option value="">Sem vínculo</option>
                            {goals.map((goal) => (
                              <option key={goal.id} value={String(goal.id)}>
                                {goal.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    {editDraft.type === 'YIELD' && entry.goal_id != null && (
                      <p className="vw-field-hint vw-field-hint--warn">
                        Rendimento não pode ficar vinculado a meta: salvar vai desvincular este
                        lançamento e o progresso da meta cai junto.
                      </p>
                    )}
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
                        {entry.goal_id != null && goalNameById.get(entry.goal_id) && (
                          <span className="vw-savings-entry-goal">🔗 {goalNameById.get(entry.goal_id)}</span>
                        )}
                        {/*
                          T-041: selo nas DUAS pernas do par, no espírito do
                          `↻ recorrente` da T-035. É só procedência: cada perna
                          segue editável/excluível sozinha.
                        */}
                        {isTransferLeg(entry) && (
                          <span
                            className="vw-savings-entry-transfer"
                            title={
                              entry.transfer_group && goalNameByTransferGroup.get(entry.transfer_group)
                                ? `Transferência da poupança para a meta ${goalNameByTransferGroup.get(entry.transfer_group)}`
                                : 'Perna de uma transferência da poupança para uma meta'
                            }
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
                ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
