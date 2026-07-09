import { useState, type FormEvent } from 'react';
import type { AlertRule, AlertRuleType, NewAlertRule } from '@vetor-wallet/shared';
import { createAlertRule, deleteAlertRule } from '../api';

interface Props {
  rules: AlertRule[];
  onUpdate: () => Promise<void>;
}

const RULE_LABELS: Record<AlertRuleType, string> = {
  PRICE_ABOVE: 'Preço acima de',
  PRICE_BELOW: 'Preço abaixo de',
  CHANGE_PCT: 'Queda superior a %',
  ALLOCATION_PCT: 'Concentração acima de %',
};

function ruleDescription(rule: AlertRule): string {
  const fmtBrl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  switch (rule.type) {
    case 'PRICE_ABOVE':
      return `${RULE_LABELS[rule.type]} ${fmtBrl.format(rule.threshold)}`;
    case 'PRICE_BELOW':
      return `${RULE_LABELS[rule.type]} ${fmtBrl.format(rule.threshold)}`;
    case 'CHANGE_PCT':
      return `Queda superior a ${rule.threshold}%`;
    case 'ALLOCATION_PCT':
      return `Concentração acima de ${rule.threshold}%`;
  }
}

const field =
  'w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-sm text-ink ' +
  'placeholder:text-dim/50 focus:outline-none focus:border-accent focus:ring-1 ' +
  'focus:ring-accent/40 transition-colors';

const label = 'block text-xs font-medium text-dim uppercase tracking-wide mb-1.5';

const btn =
  'text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

export function AlertsPanel({ rules, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState('');
  const [type, setType] = useState<AlertRuleType>('PRICE_ABOVE');
  const [threshold, setThreshold] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const isPercent = type === 'CHANGE_PCT' || type === 'ALLOCATION_PCT';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const val = parseFloat(threshold);
    if (!ticker.trim()) return setError('Informe o ticker');
    if (isNaN(val) || val <= 0) return setError('Valor inválido');

    setLoading(true);
    try {
      const rule: NewAlertRule = {
        ticker: ticker.trim().toUpperCase(),
        type,
        threshold: val,
      };
      await createAlertRule(rule);
      await onUpdate();
      setTicker('');
      setThreshold('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar alerta');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteAlertRule(id);
      await onUpdate();
    } finally {
      setDeletingId(null);
    }
  }

  const card = 'bg-card border border-edge rounded-xl p-5 md:p-6';

  if (!open) {
    return (
      <div className={card}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Alertas</h2>
            <p className="text-xs text-dim mt-0.5">
              {rules.length === 0
                ? 'Nenhuma regra cadastrada'
                : `${rules.length} regra${rules.length !== 1 ? 's' : ''} ativa${rules.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className={`${btn} bg-surface border border-edge text-ink hover:border-accent hover:text-accent`}
          >
            Gerenciar alertas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-ink">Alertas</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-dim hover:text-ink text-lg leading-none cursor-pointer"
        >
          ×
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <p className="text-xs font-medium text-dim uppercase tracking-wide mb-3">Nova regra</p>

        {error && (
          <div className="mb-3 text-sm text-down bg-down/10 border border-down/25 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <span className={label}>Ticker</span>
            <input
              className={field}
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="PETR4"
              maxLength={10}
            />
          </div>

          <div className="sm:col-span-2">
            <span className={label}>Condição</span>
            <select
              className={field}
              value={type}
              onChange={(e) => setType(e.target.value as AlertRuleType)}
            >
              {(Object.entries(RULE_LABELS) as [AlertRuleType, string][]).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className={label}>{isPercent ? 'Limite (%)' : 'Valor (R$)'}</span>
            <input
              className={field}
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder={isPercent ? '10' : '38.50'}
              min="0.0001"
              step="any"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className={`${btn} bg-accent hover:bg-accent-hover text-white`}
          >
            {loading ? 'Salvando...' : 'Adicionar regra'}
          </button>
        </div>
      </form>

      {/* Rules list */}
      {rules.length > 0 && (
        <div className="mt-5 border-t border-edge/50 pt-5">
          <p className="text-xs font-medium text-dim uppercase tracking-wide mb-3">Regras ativas</p>
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between text-sm bg-surface border border-edge rounded-lg px-3 py-2.5"
              >
                <div>
                  <span className="font-semibold text-ink">{rule.ticker}</span>
                  <span className="text-dim ml-2">{ruleDescription(rule)}</span>
                </div>
                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={deletingId === rule.id}
                  className="text-dim hover:text-down transition-colors text-xs ml-4 cursor-pointer disabled:opacity-50"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
