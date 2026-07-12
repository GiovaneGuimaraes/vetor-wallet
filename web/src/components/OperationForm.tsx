import { useState, useRef, type FormEvent } from 'react';
import type { NewOperation, OperationType } from '@vetor-wallet/shared';
import { TickerCombobox } from './TickerCombobox';

interface Props {
  onSubmit: (op: NewOperation) => Promise<void>;
}

const field =
  'w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-sm text-ink ' +
  'placeholder:text-dim/50 focus:outline-none focus:border-accent focus:ring-1 ' +
  'focus:ring-accent/40 transition-colors';

const label = 'block text-xs font-medium text-dim uppercase tracking-wide mb-1.5';

export function OperationForm({ onSubmit }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [ticker, setTicker] = useState('');
  const [tickerIsKnown, setTickerIsKnown] = useState<boolean | null>(null);
  const [showUnknownWarning, setShowUnknownWarning] = useState(false);
  const [type, setType] = useState<OperationType>('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const doSubmitRef = useRef<(() => Promise<void>) | null>(null);

  async function doSubmit(op: NewOperation) {
    setLoading(true);
    try {
      await onSubmit(op);
      setTicker('');
      setTickerIsKnown(null);
      setQuantity('');
      setPrice('');
      setDate(today);
      setShowUnknownWarning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setShowUnknownWarning(false);

    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    if (!ticker.trim()) return setError('Informe o ticker');
    if (isNaN(qty) || qty <= 0) return setError('Quantidade inválida');
    if (isNaN(prc) || prc <= 0) return setError('Preço inválido');
    if (!date) return setError('Informe a data');
    if (date > today) return setError('Data não pode ser futura');

    const op: NewOperation = { ticker: ticker.trim().toUpperCase(), type, quantity: qty, price: prc, date };

    if (tickerIsKnown === false) {
      doSubmitRef.current = () => doSubmit(op);
      setShowUnknownWarning(true);
      return;
    }

    await doSubmit(op);
  }

  function handleTickerChange(value: string, isKnown: boolean | null) {
    setTicker(value);
    setTickerIsKnown(isKnown);
    setShowUnknownWarning(false);
  }

  return (
    <form className="bg-card border border-edge rounded-xl p-5 md:p-6" onSubmit={handleSubmit}>
      <h2 className="text-sm font-semibold text-ink mb-4">Nova Operação</h2>

      {error && (
        <div className="mb-4 text-sm text-down bg-down/10 border border-down/25 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {showUnknownWarning && (
        <div className="mb-4 text-sm bg-warn/10 border border-warn/30 rounded-lg px-3 py-2.5">
          <p className="text-ink mb-2">
            <span className="font-semibold">{ticker}</span> não está na lista de ativos conhecidos da brapi.dev. Deseja registrar mesmo assim?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowUnknownWarning(false); doSubmitRef.current?.(); }}
              className="text-xs font-medium bg-warn/20 hover:bg-warn/30 text-ink px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Registrar mesmo assim
            </button>
            <button
              type="button"
              onClick={() => setShowUnknownWarning(false)}
              className="text-xs font-medium text-dim hover:text-ink px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="relative">
          <span className={label}>Ticker</span>
          <TickerCombobox
            value={ticker}
            onChange={handleTickerChange}
            className={field}
            placeholder="PETR4"
          />
        </div>

        <div>
          <span className={label}>Tipo</span>
          <select
            className={field}
            value={type}
            onChange={(e) => setType(e.target.value as OperationType)}
          >
            <option value="BUY">Compra</option>
            <option value="SELL">Venda</option>
          </select>
        </div>

        <div>
          <span className={label}>Quantidade</span>
          <input
            className={field}
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="100"
            min="0.0001"
            step="any"
          />
        </div>

        <div>
          <span className={label}>Preço (R$)</span>
          <input
            className={field}
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="38.50"
            min="0.0001"
            step="any"
          />
        </div>

        <div>
          <span className={label}>Data</span>
          <input
            className={field}
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col justify-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? 'Salvando...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </form>
  );
}
