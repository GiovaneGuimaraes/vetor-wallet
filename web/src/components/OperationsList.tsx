import type { Operation } from '../types';

interface Props {
  operations: Operation[];
  onDelete: (id: number) => Promise<void>;
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const th = 'pb-3 text-xs font-medium text-dim uppercase tracking-wide whitespace-nowrap';
const td = 'py-3 whitespace-nowrap';

export function OperationsList({ operations, onDelete }: Props) {
  if (operations.length === 0) {
    return (
      <div className="bg-card border border-edge rounded-xl p-5 md:p-6">
        <h2 className="text-sm font-semibold text-ink mb-4">Operações</h2>
        <p className="text-sm text-dim text-center py-8">Nenhuma operação cadastrada.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-edge rounded-xl p-5 md:p-6">
      <h2 className="text-sm font-semibold text-ink mb-4">
        Operações <span className="font-normal text-dim">({operations.length})</span>
      </h2>

      <div className="overflow-x-auto -mx-5 md:-mx-6">
        <table className="w-full text-sm" style={{ minWidth: '580px' }}>
          <thead>
            <tr className="border-b border-edge/60 mx-5 md:mx-6">
              <th className={`${th} text-left pl-5 md:pl-6 pr-4`}>Data</th>
              <th className={`${th} text-left pr-4`}>Ticker</th>
              <th className={`${th} text-left pr-4`}>Tipo</th>
              <th className={`${th} text-right pr-4`}>Qtd</th>
              <th className={`${th} text-right pr-4`}>Preço</th>
              <th className={`${th} text-right pr-4`}>Total</th>
              <th className={`${th} pr-5 md:pr-6`} />
            </tr>
          </thead>
          <tbody>
            {operations.map((op) => (
              <tr
                key={op.id}
                className="border-b border-edge/30 last:border-0 hover:bg-raised/50 transition-colors group"
              >
                <td className={`${td} pl-5 md:pl-6 pr-4 font-mono text-xs text-dim`}>{op.date}</td>
                <td className={`${td} pr-4 font-semibold text-ink`}>{op.ticker}</td>
                <td className={`${td} pr-4`}>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      op.type === 'BUY' ? 'bg-accent/15 text-accent' : 'bg-down/15 text-down'
                    }`}
                  >
                    {op.type === 'BUY' ? 'Compra' : 'Venda'}
                  </span>
                </td>
                <td className={`${td} pr-4 text-right tabular-nums text-ink/70`}>
                  {op.quantity.toLocaleString('pt-BR')}
                </td>
                <td className={`${td} pr-4 text-right tabular-nums text-ink/70`}>
                  {fmt.format(op.price)}
                </td>
                <td className={`${td} pr-4 text-right tabular-nums font-medium text-ink`}>
                  {fmt.format(op.quantity * op.price)}
                </td>
                <td className={`${td} pr-5 md:pr-6 text-right`}>
                  <button
                    onClick={() => onDelete(op.id)}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-dim hover:text-down hover:bg-down/10 transition-all cursor-pointer text-base leading-none"
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
