import { useState, useEffect, useRef } from 'react';
import type { PortfolioSummary, Position } from '@vetor-wallet/shared';
import '../routes/dashboard.css';

interface Props {
  summary: PortfolioSummary | null;
  walletColor?: string;
}

// ── Formatters ────────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number | null) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const fmtCur = (v: number | null) => (v === null ? '—' : fmt.format(v));

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
        borderRadius: 'var(--radius-card)',
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

// ── PositionRow ───────────────────────────────────────────────────────────
interface PositionRowProps {
  p: Position;
}

function PositionRow({ p }: PositionRowProps) {
  const isUp = p.profitLoss === null ? null : p.profitLoss >= 0;
  const plColor =
    isUp === null ? 'var(--color-ink)' : isUp ? 'var(--color-up)' : 'var(--color-down)';

  return (
    <tr className="vw-positions-row">
      <td>{p.ticker}</td>
      <td style={{ color: 'var(--color-ink)', opacity: 0.7 }}>
        {p.quantity.toLocaleString('pt-BR')}
      </td>
      <td style={{ color: 'var(--color-ink)', opacity: 0.7 }}>{fmt.format(p.avgPrice)}</td>
      <td style={{ color: 'var(--color-ink)', opacity: 0.7 }}>{fmtCur(p.currentPrice)}</td>
      <td style={{ color: 'var(--color-ink)', opacity: 0.7 }}>{fmtCur(p.currentValue)}</td>
      <td style={{ color: plColor, fontWeight: 500 }}>{fmtCur(p.profitLoss)}</td>
      <td style={{ color: plColor, fontWeight: 500 }}>{fmtPct(p.profitLossPct)}</td>
    </tr>
  );
}

// ── PortfolioDashboard ────────────────────────────────────────────────────
export function PortfolioDashboard({ summary, walletColor = '#e3d5b8' }: Props) {
  // Suppress unused var warning — walletColor reserved for future wallet selector
  void walletColor;

  if (!summary || summary.positions.length === 0) {
    return (
      <div
        style={{
          background: 'var(--card-1)',
          border: '1px solid var(--color-edge)',
          borderRadius: 'var(--radius-card)',
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

      {/* Summary cards — 3 cols: Valor atual, Investido, Resultado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px]">
        <SummaryCard label="Valor Atual" value={totalCurrentValue} />
        <SummaryCard label="Investido" value={totalInvested} />
        <SummaryCard
          label="Resultado"
          value={totalProfitLoss}
          pct={totalProfitLossPct}
          sentiment={resultSentiment}
        />
      </div>

      {/* Positions table — exatamente 7 colunas, sem linha expansível */}
      <div
        style={{
          background: 'var(--card-1)',
          border: '1px solid var(--color-edge)',
          borderRadius: 'var(--radius-card)',
          padding: '20px 0',
        }}
      >
        <h2
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-ink)',
            paddingInline: 22,
            marginBottom: 16,
          }}
        >
          Posições
        </h2>

        <div className="vw-positions-table-wrap">
          <table className="vw-positions-table" style={{ minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(var(--edge-rgb), 0.5)' }}>
                <th>Ticker</th>
                <th>Qtd</th>
                <th>PM (R$)</th>
                <th>Cotação</th>
                <th>Valor Atual</th>
                <th>Resultado</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <PositionRow key={p.ticker} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
