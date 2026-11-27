import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { QuoteSnapshot } from '@vetor-wallet/shared';
import { PriceChart } from './PriceChart';
import { useTickerHistory } from './tickerHistory';
import {
  CHART_PERIODS,
  IBOV_TICKER,
  formatIndexPoints,
  periodChange,
  slicePeriod,
  tickerLabel,
  type ChartPeriod,
} from '../routes/stockCharts';
import { changeTone, formatChange, formatPrice } from '../routes/marketToday';
import { formatDayMonth } from '../routes/expenseMonth';
// Estilos do modal (`.vw-modal*`) vivem com o primeiro modal do app.
import './pluggyImport.css';

export interface StockChartModalProps {
  ticker: string;
  /** Nome já conhecido pela lista (o histórico também traz um). */
  name?: string | null;
  /** Preço médio do usuário, quando o ativo está na carteira (linha tracejada). */
  averagePrice?: number | null;
  onClose: () => void;
}

/**
 * Gráfico expandido de um ativo (aberto pela carteira ou pelo "Mercado hoje").
 * Períodos 5D/1M/3M são recortes do MESMO histórico de 3 meses — trocar de
 * período não faz requisição. Sem 1D/1A: o plano grátis da brapi não entrega.
 * Reaproveita o `PriceChart` (SVG à mão, hover/tooltip) do card "Preço por ação".
 * Portal no `body`: `.vw-main` tem transform (ver `PluggyImportModal`).
 */
export function StockChartModal({
  ticker,
  name,
  averagePrice = null,
  onClose,
}: StockChartModalProps) {
  const [period, setPeriod] = useState<ChartPeriod>('1M');
  const state = useTickerHistory(ticker, { priority: 'high' });
  const dialogRef = useRef<HTMLDivElement>(null);
  const isIndex = ticker === IBOV_TICKER;
  const fmt = isIndex ? formatIndexPoints : formatPrice;
  // Tela larga ganha viewBox maior: os rótulos (fontSize fixo no SVG) não
  // inflam quando o gráfico escala até ~620 px; no celular fica o 320 de sempre.
  const [wide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 560);

  // Esc fecha; Tab/Shift+Tab ficam presos dentro do diálogo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href]'),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Foco no diálogo ao abrir e de volta em quem abriu ao fechar.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, []);

  const points = state.status === 'ok' ? slicePeriod(state.data.points, period) : [];
  const change = periodChange(points);
  const snapshots: QuoteSnapshot[] = points.map((p, i) => ({
    id: i,
    ticker,
    price: p.close,
    captured_at: p.date,
  }));
  const title = tickerLabel(ticker);
  const subtitle = name ?? (state.status === 'ok' ? state.data.name : null);

  return createPortal(
    <div className="vw-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="vw-modal vw-stock-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vw-stock-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="vw-modal-head">
          <div className="vw-modal-head-main">
            <div>
              <h2 id="vw-stock-title">{title}</h2>
              {subtitle && subtitle !== title && <p className="vw-modal-head-sub">{subtitle}</p>}
            </div>
          </div>
          <button type="button" className="vw-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="vw-modal-body vw-stock-body">
          <div className="vw-history-window" role="group" aria-label="Período do gráfico">
            {CHART_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={`vw-history-window-btn ${period === p ? 'vw-history-window-btn--active' : ''}`}
              >
                {p}
              </button>
            ))}
          </div>

          {state.status === 'loading' && <p className="vw-field-hint">Carregando histórico…</p>}
          {state.status === 'error' && (
            <p className="vw-field-hint vw-field-hint--warn" role="alert">
              Histórico de preço indisponível para este ativo agora.
            </p>
          )}
          {state.status === 'ok' && change === null && (
            <p className="vw-field-hint">Sem histórico suficiente para este período.</p>
          )}
          {state.status === 'ok' && change !== null && (
            <>
              <dl className="vw-stock-summary">
                <div>
                  <dt>Início ({formatDayMonth(points[0].date)})</dt>
                  <dd>{fmt(change.start)}</dd>
                </div>
                <div>
                  <dt>Fim ({formatDayMonth(points[points.length - 1].date)})</dt>
                  <dd>{fmt(change.end)}</dd>
                </div>
                <div>
                  <dt>Variação no período</dt>
                  <dd
                    className={`vw-market-change vw-market-change--${
                      change.pct === null ? 'flat' : changeTone(change.pct)
                    }`}
                  >
                    {change.pct === null ? '—' : formatChange(change.pct)}
                  </dd>
                </div>
              </dl>
              <div className="vw-history-chart-wrap">
                <PriceChart
                  snapshots={snapshots}
                  averagePrice={isIndex ? null : averagePrice}
                  formatValue={fmt}
                  viewWidth={wide ? 460 : 320}
                  viewHeight={wide ? 210 : 170}
                />
              </div>
              <p className="vw-market-note">
                Fechamentos diários (brapi, com atraso). Atualizado a cada poucas horas.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
