import type { Operation } from '../types';

interface Props {
  operations: Operation[];
  onDelete: (id: number) => Promise<void>;
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function OperationsList({ operations, onDelete }: Props) {
  if (operations.length === 0) {
    return (
      <div className="card">
        <h2>Operações</h2>
        <p className="empty">Nenhuma operação cadastrada.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Operações ({operations.length})</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Ticker</th>
              <th>Tipo</th>
              <th>Qtd</th>
              <th>Preço</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {operations.map((op) => (
              <tr key={op.id}>
                <td>{op.date}</td>
                <td>
                  <strong>{op.ticker}</strong>
                </td>
                <td>
                  <span className={`badge ${op.type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                    {op.type === 'BUY' ? 'Compra' : 'Venda'}
                  </span>
                </td>
                <td>{op.quantity.toLocaleString('pt-BR')}</td>
                <td>{fmt.format(op.price)}</td>
                <td>{fmt.format(op.quantity * op.price)}</td>
                <td>
                  <button
                    className="btn-danger"
                    onClick={() => onDelete(op.id)}
                    title="Remover operação"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
