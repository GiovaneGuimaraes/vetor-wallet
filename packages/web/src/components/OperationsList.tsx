import { useState, useRef, useEffect } from 'react';
import type { Operation } from '@vetor-wallet/shared';

interface Props {
  operations: Operation[];
  onDelete: (id: number) => Promise<void>;
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const COLS = '1fr .9fr .9fr .6fr .9fr 1fr 30px';

const rowBase: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: COLS,
  alignItems: 'center',
  padding: '12px 22px',
};

const headerBase: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: COLS,
  alignItems: 'center',
  padding: '0 22px 12px',
};

const LBL = 'text-[11px] uppercase tracking-wider font-medium text-dim';

export function OperationsList({ operations, onDelete }: Props) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const prevIds = useRef<Set<number>>(new Set(operations.map((op) => op.id)));
  const isFirst = useRef(true);

  // Detect newly-added rows and apply a brief flash animation
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      prevIds.current = new Set(operations.map((op) => op.id));
      return;
    }
    const currentIds = new Set(operations.map((op) => op.id));
    const added = new Set<number>();
    currentIds.forEach((id) => {
      if (!prevIds.current.has(id)) added.add(id);
    });
    prevIds.current = currentIds;
    if (added.size > 0) {
      setNewIds(added);
      const timer = setTimeout(() => setNewIds(new Set()), 1400);
      return () => clearTimeout(timer);
    }
  }, [operations]);

  async function handleDelete(op: Operation) {
    if (
      !window.confirm(
        `Remover operação de ${op.type === 'BUY' ? 'Compra' : 'Venda'} de ${op.ticker} em ${op.date}?`,
      )
    )
      return;
    setDeleteError('');
    setDeletingId(op.id);
    try {
      await onDelete(op.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Falha ao remover operação');
    } finally {
      setDeletingId(null);
    }
  }

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
      <style>{`
        @keyframes row-flash {
          from { background-color: rgba(var(--accent-rgb), .22); }
          to   { background-color: transparent; }
        }
        .ops-row-new {
          animation: row-flash 1.2s ease-out both;
        }
      `}</style>

      <h2 className="text-sm font-semibold text-ink mb-4">
        Operações{' '}
        <span className="font-normal text-dim">({operations.length})</span>
      </h2>

      {deleteError && (
        <div className="mb-4 text-sm text-down bg-down/10 border border-down/25 rounded-lg px-3 py-2">
          {deleteError}
        </div>
      )}

      <div className="overflow-x-auto -mx-5 md:-mx-6">
        <div style={{ minWidth: '560px' }}>
          {/* Header */}
          <div
            style={headerBase}
            className="border-b border-edge/50"
          >
            <span className={LBL}>Data</span>
            <span className={LBL}>Ticker</span>
            <span className={LBL}>Tipo</span>
            <span className={`${LBL} text-right`}>Qtd</span>
            <span className={`${LBL} text-right`}>Preço</span>
            <span className={`${LBL} text-right`}>Total</span>
            <span />
          </div>

          {/* Rows */}
          {operations.map((op) => (
            <div
              key={op.id}
              style={{
                ...rowBase,
                borderTop: '1px solid rgba(var(--edge-rgb), .35)',
              }}
              className={`group hover:bg-raised/55 transition-colors${newIds.has(op.id) ? ' ops-row-new' : ''}`}
            >
              {/* Data */}
              <span className="font-mono text-[12px] text-dim">{op.date}</span>

              {/* Ticker */}
              <span className="font-semibold text-sm text-ink">{op.ticker}</span>

              {/* Tipo — pill */}
              <span>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  style={
                    op.type === 'BUY'
                      ? {
                          background: 'rgba(var(--accent-rgb), .15)',
                          color: 'var(--color-accent-2)',
                        }
                      : {
                          background: 'rgba(var(--down-rgb, 244, 63, 94), .15)',
                          color: 'var(--color-down)',
                        }
                  }
                >
                  {op.type === 'BUY' ? 'Compra' : 'Venda'}
                </span>
              </span>

              {/* Qtd */}
              <span className="text-right text-sm tabular-nums text-ink/70">
                {op.quantity.toLocaleString('pt-BR')}
              </span>

              {/* Preço */}
              <span className="text-right text-sm tabular-nums text-ink/70">
                {fmt.format(op.price)}
              </span>

              {/* Total */}
              <span className="text-right text-sm tabular-nums font-medium text-ink">
                {fmt.format(op.quantity * op.price)}
              </span>

              {/* Delete button */}
              <div className="flex justify-end">
                <button
                  onClick={() => handleDelete(op)}
                  disabled={deletingId === op.id}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-dim hover:text-down hover:bg-down/10 transition-all cursor-pointer text-base leading-none disabled:cursor-wait"
                  title="Remover operação"
                >
                  {deletingId === op.id ? '…' : '×'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
