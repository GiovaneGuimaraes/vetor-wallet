import { useState, type FormEvent } from 'react';
import type { NewOperation, OperationType } from '../types';

interface Props {
  onSubmit: (op: NewOperation) => Promise<void>;
}

export function OperationForm({ onSubmit }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [ticker, setTicker] = useState('');
  const [type, setType] = useState<OperationType>('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    if (!ticker.trim()) return setError('Informe o ticker');
    if (isNaN(qty) || qty <= 0) return setError('Quantidade inválida');
    if (isNaN(prc) || prc <= 0) return setError('Preço inválido');
    if (!date) return setError('Informe a data');

    setLoading(true);
    try {
      await onSubmit({
        ticker: ticker.trim().toUpperCase(),
        type,
        quantity: qty,
        price: prc,
        date,
      });
      setTicker('');
      setQuantity('');
      setPrice('');
      setDate(today);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="operation-form card" onSubmit={handleSubmit}>
      <h2>Nova Operação</h2>
      {error && <p className="error">{error}</p>}
      <div className="form-row">
        <label>
          Ticker
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="ex: PETR4"
            maxLength={10}
          />
        </label>
        <label>
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value as OperationType)}>
            <option value="BUY">Compra</option>
            <option value="SELL">Venda</option>
          </select>
        </label>
        <label>
          Quantidade
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="100"
            min="0.0001"
            step="any"
          />
        </label>
        <label>
          Preço (R$)
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="38.50"
            min="0.0001"
            step="any"
          />
        </label>
        <label>
          Data
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Salvando...' : 'Adicionar'}
        </button>
      </div>
    </form>
  );
}
