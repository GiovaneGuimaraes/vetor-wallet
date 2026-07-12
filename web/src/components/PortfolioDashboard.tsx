import { useState, useEffect, useRef, useCallback } from 'react';
import type { PortfolioSummary, Position } from '@vetor-wallet/shared';

interface Props {
  summary: PortfolioSummary | null;
  walletColor?: string;
}

// ── Formatters ────────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number | null) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const fmtCur = (v: number | null) => (v === null ? '—' : fmt.format(v));

// ── Palette ───────────────────────────────────────────────────────────────
const PALETTE = [
  'var(--color-accent)',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#f43f5e',
  '#06b6d4',
];

// ── useCountUp ────────────────────────────────────────────────────────────
function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - p, 3);
}

function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const prefersReduced = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (prefersReduced.current) {
      setValue(target);
      return;
    }
    setValue(0);
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setValue(target * easeOutCubic(progress));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

// ── SummaryCard ───────────────────────────────────────────────────────────
type SentimentColor = 'up' | 'down' | null;

interface SummaryCardProps {
  label: string;
  value: number | null;
  pct?: number | null;
  sentiment?: SentimentColor;
}

function SummaryCard({ label, value, pct, sentiment }: SummaryCardProps) {
  const animated = useCountUp(value ?? 0);

  const borderColor =
    sentiment === 'up'
      ? 'rgba(16,185,129,.35)'
      : sentiment === 'down'
        ? 'rgba(244,63,94,.35)'
        : 'var(--color-edge)';

  const bgImage =
    sentiment === 'up'
      ? 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,.06) 0%, transparent 70%)'
      : sentiment === 'down'
        ? 'radial-gradient(ellipse at 50% 0%, rgba(244,63,94,.06) 0%, transparent 70%)'
        : undefined;

  const valueColor =
    sentiment === 'up'
      ? 'var(--color-up)'
      : sentiment === 'down'
        ? 'var(--color-down)'
        : 'var(--color-ink)';

  return (
    <div
      style={{
        backgroundColor: 'var(--card-1)',
        backgroundImage: bgImage,
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        padding: '20px 22px',
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          marginBottom: 10,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 28,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: valueColor,
          lineHeight: 1,
        }}
      >
        {value === null ? '—' : fmt.format(animated)}
      </p>
      {pct !== undefined && pct !== null && (
        <p
          style={{
            fontSize: 13,
            marginTop: 6,
            fontVariantNumeric: 'tabular-nums',
            color: valueColor,
            opacity: 0.85,
          }}
        >
          {fmtPct(pct)}
        </p>
      )}
    </div>
  );
}

// ── PatrimonioChart ───────────────────────────────────────────────────────
interface PatrimonioChartProps {
  invested: number;
  current: number | null;
}

function PatrimonioChart({ invested, current }: PatrimonioChartProps) {
  const W = 600,
    H = 190;
  const PAD = { top: 20, right: 16, bottom: 28, left: 16 };
  const N = 12;

  const effectiveCurrent = current ?? invested;
  const isUp = effectiveCurrent >= invested;
  const lineColor = isUp ? '#10b981' : '#f43f5e';

  const minVal = Math.min(invested, effectiveCurrent) * 0.995;
  const maxVal = Math.max(invested, effectiveCurrent) * 1.005;
  const range = maxVal - minVal || 1;

  const chartPoints = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const base = invested + (effectiveCurrent - invested) * t;
    const noise = Math.sin(i * 1.7) * range * 0.025;
    const val = base + noise;
    const normalizedY = 1 - (val - minVal) / range;
    return {
      x: PAD.left + t * (W - PAD.left - PAD.right),
      y: PAD.top + normalizedY * (H - PAD.top - PAD.bottom),
      value: val,
    };
  });

  function buildCurvePath(pts: { x: number; y: number }[]) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      d += ` C ${cpx} ${pts[i - 1].y} ${cpx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
    }
    return d;
  }

  const linePath = buildCurvePath(chartPoints);
  const last = chartPoints[chartPoints.length - 1];
  const first = chartPoints[0];
  const areaPath =
    linePath +
    ` L ${last.x} ${H - PAD.bottom}` +
    ` L ${first.x} ${H - PAD.bottom} Z`;

  const today = new Date();
  const twelveWeeksAgo = new Date(today);
  twelveWeeksAgo.setDate(today.getDate() - 84);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 190, display: 'block' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="patrimonio-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#patrimonio-grad)" />
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {chartPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={lineColor} fillOpacity={0.85}>
            <title>{fmtCur(p.value)}</title>
          </circle>
        ))}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--color-dim)',
          marginTop: 2,
          paddingInline: 16,
        }}
      >
        <span>{fmtDate(twelveWeeksAgo)}</span>
        <span>{fmtDate(today)}</span>
      </div>
    </div>
  );
}

// ── DonutChart ────────────────────────────────────────────────────────────
function DonutChart({ positions }: { positions: Position[] }) {
  const total = positions.reduce((s, p) => s + p.invested, 0);

  const segments = positions.slice(0, 6).reduce<{ ticker: string; pct: number; start: number; color: string }[]>(
    (acc, p, i) => {
      const pct = total > 0 ? (p.invested / total) * 100 : 0;
      const start = acc.length > 0 ? acc[acc.length - 1].start + acc[acc.length - 1].pct : 0;
      return [...acc, { ticker: p.ticker, pct, start, color: PALETTE[i % PALETTE.length] }];
    },
    [],
  );

  const conicStops = segments
    .map((s) => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(', ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
        <div
          style={{
            width: 128,
            height: 128,
            borderRadius: '50%',
            background: conicStops
              ? `conic-gradient(${conicStops})`
              : 'var(--color-edge)',
            WebkitMaskImage:
              'radial-gradient(circle, transparent 49px, #000 50px)',
            maskImage: 'radial-gradient(circle, transparent 49px, #000 50px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--color-ink)',
              lineHeight: 1,
            }}
          >
            {positions.length}
          </span>
          <span style={{ fontSize: 10, color: 'var(--color-dim)', marginTop: 2 }}>
            ativos
          </span>
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map((s) => (
          <div key={s.ticker} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--color-ink)', flex: 1 }}>
              {s.ticker}
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-dim)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────
function Sparkline({
  avgPrice,
  currentPrice,
}: {
  avgPrice: number;
  currentPrice: number | null;
}) {
  const W = 200,
    H = 48,
    N = 14;
  const effective = currentPrice ?? avgPrice;
  const isUp = effective >= avgPrice;
  const color = isUp ? '#10b981' : '#f43f5e';

  const minVal = Math.min(avgPrice, effective) * 0.99;
  const maxVal = Math.max(avgPrice, effective) * 1.01;
  const range = maxVal - minVal || 1;

  const pts = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const base = avgPrice + (effective - avgPrice) * t;
    const noise = Math.sin(i * 2.1 + 0.5) * range * 0.04;
    const val = base + noise;
    return {
      x: t * W,
      y: H - ((val - minVal) / range) * H * 0.8 - H * 0.1,
    };
  });

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cp = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${cp} ${pts[i - 1].y} ${cp} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

// ── MiniBar ───────────────────────────────────────────────────────────────
interface MiniBarProps {
  label: string;
  rightVal: number;
  maxVal?: number;
  leftLabel?: string;
  rightLabel?: string;
  color: string;
}

function MiniBar({ label, rightVal, maxVal, leftLabel, rightLabel, color }: MiniBarProps) {
  const max = (maxVal ?? rightVal * 1.05) || 1;
  const pct = Math.min((rightVal / max) * 100, 100);

  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--color-dim)', marginBottom: 5 }}>{label}</p>
      <div
        style={{
          height: 6,
          borderRadius: 4,
          background: 'var(--color-edge)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 4,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          marginTop: 3,
          color: 'var(--color-dim)',
        }}
      >
        {leftLabel && <span>{leftLabel}</span>}
        {rightLabel && <span style={{ marginLeft: 'auto' }}>{rightLabel}</span>}
      </div>
    </div>
  );
}

// ── PositionRow ───────────────────────────────────────────────────────────
const tdStyle: React.CSSProperties = {
  padding: '12px 8px',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const thStyle: React.CSSProperties = {
  padding: '0 8px 12px',
  textAlign: 'right',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  whiteSpace: 'nowrap',
};

interface PositionRowProps {
  p: Position;
  isExpanded: boolean;
  onToggle: () => void;
  totalInvested: number;
}

function PositionRow({ p, isExpanded, onToggle, totalInvested }: PositionRowProps) {
  const isUp = p.profitLoss === null ? null : p.profitLoss >= 0;
  const plColor =
    isUp === null ? 'var(--color-ink)' : isUp ? 'var(--color-up)' : 'var(--color-down)';
  const portfolioPct = totalInvested > 0 ? (p.invested / totalInvested) * 100 : 0;

  function handleMouseEnter(e: React.MouseEvent<HTMLTableRowElement>) {
    e.currentTarget.style.background = 'rgba(var(--raised-rgb), 0.55)';
    const btn = e.currentTarget.querySelector<HTMLElement>('.del-btn');
    if (btn) btn.style.opacity = '1';
  }
  function handleMouseLeave(e: React.MouseEvent<HTMLTableRowElement>) {
    e.currentTarget.style.background = 'transparent';
    const btn = e.currentTarget.querySelector<HTMLElement>('.del-btn');
    if (btn) btn.style.opacity = '0';
  }

  return (
    <>
      <tr
        onClick={onToggle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'pointer', borderBottom: '1px solid rgba(var(--edge-rgb), 0.3)', transition: 'background 0.12s' }}
      >
        <td
          style={{
            ...tdStyle,
            textAlign: 'left',
            paddingLeft: 20,
            paddingRight: 8,
            fontWeight: 600,
            color: 'var(--color-ink)',
          }}
        >
          <span
            style={{
              marginRight: 6,
              fontSize: 10,
              color: 'var(--color-dim)',
              display: 'inline-block',
              transform: isExpanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          >
            ▶
          </span>
          {p.ticker}
        </td>
        <td style={{ ...tdStyle, color: 'var(--color-ink)', opacity: 0.7 }}>
          {p.quantity.toLocaleString('pt-BR')}
        </td>
        <td style={{ ...tdStyle, color: 'var(--color-ink)', opacity: 0.7 }}>
          {fmt.format(p.avgPrice)}
        </td>
        <td style={{ ...tdStyle, color: 'var(--color-ink)', opacity: 0.7 }}>
          {fmtCur(p.currentPrice)}
        </td>
        <td style={{ ...tdStyle, color: 'var(--color-ink)', opacity: 0.7 }}>
          {fmt.format(p.invested)}
        </td>
        <td style={{ ...tdStyle, color: 'var(--color-ink)', opacity: 0.7 }}>
          {fmtCur(p.currentValue)}
        </td>
        <td style={{ ...tdStyle, color: plColor, fontWeight: 500 }}>
          {fmtCur(p.profitLoss)}
        </td>
        <td style={{ ...tdStyle, color: plColor, fontWeight: 500 }}>
          {fmtPct(p.profitLossPct)}
        </td>
        <td style={{ ...tdStyle, paddingRight: 20, color: 'var(--color-dim)' }}>
          {p.allocationPct !== null ? `${p.allocationPct.toFixed(1)}%` : '—'}
        </td>
      </tr>

      {isExpanded && (
        <tr style={{ borderBottom: '1px solid rgba(var(--edge-rgb), 0.3)' }}>
          <td
            colSpan={9}
            style={{
              padding: '14px 20px 18px',
              background: 'rgba(var(--raised-rgb), 0.3)',
            }}
          >
            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--color-dim)', marginBottom: 8 }}>
                  Evolução PM → Cotação
                </p>
                <Sparkline avgPrice={p.avgPrice} currentPrice={p.currentPrice} />
              </div>

              <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <MiniBar
                  label="PM vs. Cotação"
                  rightVal={p.currentPrice ?? p.avgPrice}
                  maxVal={Math.max(p.avgPrice, p.currentPrice ?? p.avgPrice) * 1.05}
                  leftLabel={fmt.format(p.avgPrice)}
                  rightLabel={fmtCur(p.currentPrice)}
                  color={isUp === null || isUp ? '#10b981' : '#f43f5e'}
                />
                <MiniBar
                  label="Participação na carteira"
                  rightVal={portfolioPct}
                  maxVal={100}
                  rightLabel={`${portfolioPct.toFixed(1)}%`}
                  color="var(--color-accent)"
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── PortfolioDashboard ────────────────────────────────────────────────────
export function PortfolioDashboard({ summary, walletColor = '#e3d5b8' }: Props) {
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const toggleRow = useCallback((ticker: string) => {
    setExpandedTicker((prev) => (prev === ticker ? null : ticker));
  }, []);

  // Suppress unused var warning — walletColor reserved for future wallet selector
  void walletColor;

  if (!summary || summary.positions.length === 0) {
    return (
      <div
        style={{
          background: 'var(--card-1)',
          border: '1px solid var(--color-edge)',
          borderRadius: 14,
          padding: '20px 24px',
        }}
      >
        <h2
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 16 }}
        >
          Dashboard
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-dim)',
            textAlign: 'center',
            padding: '32px 0',
          }}
        >
          Adicione operações para ver sua carteira.
        </p>
      </div>
    );
  }

  const { positions, totalInvested, totalCurrentValue, totalProfitLoss, totalProfitLossPct } =
    summary;

  const hasUnavailableQuotes = positions.some((p) => p.currentPrice === null);
  const unavailableTickers = positions
    .filter((p) => p.currentPrice === null)
    .map((p) => p.ticker)
    .join(', ');

  const resultSentiment: SentimentColor =
    totalProfitLoss === null ? null : totalProfitLoss >= 0 ? 'up' : 'down';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Warning banner */}
      {hasUnavailableQuotes && (
        <div
          style={{
            background: 'rgba(245,158,11,.08)',
            border: '1px solid rgba(245,158,11,.3)',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 13,
            color: 'var(--color-ink)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>
            Cotações indisponíveis para {unavailableTickers}. Valor atual e resultado não podem
            ser calculados para{' '}
            {positions.filter((p) => p.currentPrice === null).length === 1
              ? 'esse ativo'
              : 'esses ativos'}
            . A brapi.dev pode estar fora do ar ou o limite da API foi atingido.
          </span>
        </div>
      )}

      {/* Summary cards — 3 cols */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px]">
        <SummaryCard label="Investido" value={totalInvested} />
        <SummaryCard label="Valor Atual" value={totalCurrentValue} />
        <SummaryCard
          label="Resultado"
          value={totalProfitLoss}
          pct={totalProfitLossPct}
          sentiment={resultSentiment}
        />
      </div>

      {/* Patrimônio chart + Donut */}
      <div className="grid grid-cols-1 gap-4 md:[grid-template-columns:1.6fr_1fr]">
        <div
          style={{
            background: 'var(--card-1)',
            border: '1px solid var(--color-edge)',
            borderRadius: 14,
            paddingTop: 20,
            paddingBottom: 12,
            overflow: 'hidden',
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              paddingInline: 20,
              marginBottom: 8,
            }}
          >
            Patrimônio
          </p>
          <PatrimonioChart invested={totalInvested} current={totalCurrentValue} />
        </div>

        <div
          style={{
            background: 'var(--card-1)',
            border: '1px solid var(--color-edge)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginBottom: 16,
            }}
          >
            Alocação
          </p>
          <DonutChart positions={positions} />
        </div>
      </div>

      {/* Positions table */}
      <div
        style={{
          background: 'var(--card-1)',
          border: '1px solid var(--color-edge)',
          borderRadius: 14,
          padding: '20px 0',
        }}
      >
        <h2
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-ink)',
            paddingInline: 20,
            marginBottom: 16,
          }}
        >
          Posições
        </h2>

        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              minWidth: 760,
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(var(--edge-rgb), 0.5)' }}>
                <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 20 }}>Ticker</th>
                <th style={thStyle}>Qtd</th>
                <th style={thStyle}>PM (R$)</th>
                <th style={thStyle}>Cotação</th>
                <th style={thStyle}>Investido</th>
                <th style={thStyle}>Valor Atual</th>
                <th style={thStyle}>Resultado</th>
                <th style={thStyle}>%</th>
                <th style={{ ...thStyle, paddingRight: 20 }}>Carteira</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <PositionRow
                  key={p.ticker}
                  p={p}
                  isExpanded={expandedTicker === p.ticker}
                  onToggle={() => toggleRow(p.ticker)}
                  totalInvested={totalInvested}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
