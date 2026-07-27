import type { BenchmarkData } from '@vetor-wallet/shared';

interface Props {
  data: BenchmarkData;
}

function formatDateBR(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtPct(v: number | null) {
  if (v === null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function pctColor(v: number | null) {
  if (v === null) return 'text-dim';
  return v >= 0 ? 'text-up' : 'text-down';
}

interface BarRowProps {
  label: string;
  labelColor: string;
  value: number | null;
  maxAbs: number;
}

function BarRow({ label, labelColor, value, maxAbs }: BarRowProps) {
  const widthPct = value !== null && maxAbs > 0 ? (Math.abs(value) / maxAbs) * 100 : 0;
  const barColor = value === null ? '' : value >= 0 ? 'bg-up/70' : 'bg-down/70';

  return (
    <div className="flex items-center gap-3">
      <span className={`text-xs font-medium w-16 shrink-0 ${labelColor}`}>{label}</span>
      <div className="flex-1 h-3 bg-raised/60 rounded-full overflow-hidden">
        {value !== null && (
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${widthPct}%` }}
          />
        )}
      </div>
      <span className={`text-sm font-semibold tabular-nums w-20 text-right ${pctColor(value)}`}>
        {fmtPct(value)}
      </span>
    </div>
  );
}

export function BenchmarkComparison({ data }: Props) {
  const values = [data.portfolio, data.cdi, data.ibovespa].filter((v) => v !== null) as number[];
  const maxAbs = values.length ? Math.max(...values.map(Math.abs), 0.01) : 1;

  const items: BarRowProps[] = [
    { label: 'Carteira', labelColor: 'text-accent', value: data.portfolio, maxAbs },
    { label: 'CDI', labelColor: 'text-warn', value: data.cdi, maxAbs },
    { label: 'Ibovespa', labelColor: 'text-dim', value: data.ibovespa, maxAbs },
  ];

  return (
    <div className="bg-card border border-edge rounded-xl p-5 md:p-6">
      <div className="flex items-baseline gap-3 mb-5">
        <h2 className="text-sm font-semibold text-ink">Comparativo de rentabilidade</h2>
        <span className="text-xs text-dim">desde {formatDateBR(data.period.from)}</span>
      </div>
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <BarRow key={item.label} {...item} />
        ))}
      </div>
    </div>
  );
}
