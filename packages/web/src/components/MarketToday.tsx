import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MarketQuote, MarketTodayResponse } from '@vetor-wallet/shared';
import { getMarketToday } from '../api';
import {
  changeTone,
  formatAsOf,
  formatChange,
  formatPrice,
  formatTradedValue,
  ownedTickerSet,
} from '../routes/marketToday';
import { IBOV_TICKER } from '../routes/stockCharts';
import { IbovespaCard } from './IbovespaCard';
import { TickerSparkline } from './TickerSparkline';

type Tab = 'gainers' | 'losers' | 'mostTraded';

const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: 'gainers', label: 'Maiores altas', empty: 'Nenhuma ação em alta com liquidez hoje.' },
  { key: 'losers', label: 'Maiores baixas', empty: 'Nenhuma ação em baixa com liquidez hoje.' },
  { key: 'mostTraded', label: 'Mais negociadas', empty: 'Sem dados de negociação hoje.' },
];

/**
 * Seção "Mercado hoje" de `/investimentos/acoes`: lista compacta (ticker, nome,
 * preço, variação do dia) de `GET /api/market/today`. Só dado de mercado, sem
 * ranking próprio; tickers que o usuário já tem em carteira vêm marcados.
 * A falha do fetch fica isolada aqui — nunca derruba o resto da página.
 */
export function MarketToday({
  positions,
  onSelectTicker,
  chartsEnabled = true,
}: {
  positions: { ticker: string }[] | null;
  /** Abre o gráfico expandido (Ibovespa ou linha da lista). */
  onSelectTicker: (ticker: string, name: string | null) => void;
  /**
   * `false` = ainda não pedir os históricos (minigráficos/Ibovespa). A página
   * só libera depois que a carteira carregou: as cotações dela vêm primeiro e
   * os gráficos da carteira saem antes dos do mercado.
   */
  chartsEnabled?: boolean;
}) {
  const [data, setData] = useState<MarketTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>('gainers');
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true);
    setError(false);
    try {
      const res = await getMarketToday();
      if (requestRef.current !== id) return;
      setData(res);
    } catch {
      if (requestRef.current !== id) return;
      setError(true);
    } finally {
      if (requestRef.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const owned = useMemo(() => ownedTickerSet(positions), [positions]);
  const active = TABS.find((t) => t.key === tab)!;
  const rows: MarketQuote[] = data ? data[tab] : [];
  const asOf = data ? formatAsOf(data.asOf) : null;

  return (
    <section className="vw-form-card vw-market" aria-label="Mercado hoje">
      <div className="vw-market-head">
        <p className="vw-form-title">Mercado hoje</p>
        <span className="vw-market-note">
          Cotações com atraso{asOf ? ` · dado das ${asOf}` : ''}
        </span>
      </div>

      <IbovespaCard
        enabled={chartsEnabled}
        onSelect={() => onSelectTicker(IBOV_TICKER, 'Ibovespa')}
      />

      <div className="vw-history-window vw-market-tabs" role="group" aria-label="Lista do mercado">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`vw-history-window-btn ${tab === t.key ? 'vw-history-window-btn--active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <p className="vw-field-hint">Carregando mercado…</p>
      ) : error && !data ? (
        <p className="vw-field-hint vw-field-hint--warn" role="alert">
          Não foi possível carregar o mercado agora.{' '}
          <button type="button" className="underline cursor-pointer" onClick={() => void load()}>
            Tentar novamente
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="vw-field-hint">{active.empty}</p>
      ) : (
        <ul className="vw-market-list">
          {rows.map((q) => {
            const tone = changeTone(q.change);
            return (
              <li key={q.ticker} className="vw-market-item">
                <button
                  type="button"
                  className="vw-market-row"
                  onClick={() => onSelectTicker(q.ticker, q.name)}
                  title="Abrir gráfico"
                >
                  <span className="vw-market-id">
                    <span className="vw-market-ticker">
                      {q.ticker}
                      {owned.has(q.ticker.toUpperCase()) && (
                        <span className="vw-market-owned">Na carteira</span>
                      )}
                    </span>
                    <span className="vw-market-name">
                      {tab === 'mostTraded' ? `${q.name} · ${formatTradedValue(q)}` : q.name}
                    </span>
                  </span>
                  <TickerSparkline ticker={q.ticker} enabled={chartsEnabled} />
                  <span className="vw-market-quote">
                    <span className="vw-market-price">{formatPrice(q.close)}</span>
                    <span className={`vw-market-change vw-market-change--${tone}`}>
                      {formatChange(q.change)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
