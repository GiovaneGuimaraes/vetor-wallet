import { useEffect, useState } from 'react';
import type { TickerHistory } from '@vetor-wallet/shared';
import { getTickerHistory } from '../api';
import { createHistoryLoader, type LoadPriority } from '../routes/historyLoader';

/**
 * Instância única do carregador de históricos (cache de 30 min no navegador,
 * no máximo 3 pedidos ao nosso servidor por vez). Todos os minigráficos e o
 * gráfico expandido passam por aqui: o mesmo ativo em duas listas é 1 pedido.
 */
export const tickerHistoryLoader = createHistoryLoader(getTickerHistory, {
  concurrency: 3,
  ttlMs: 30 * 60 * 1000,
});

export type TickerHistoryState =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: TickerHistory };

export interface TickerHistoryOptions {
  /** `false` = ainda não pedir (ex.: Mercado hoje espera a carteira carregar). */
  enabled?: boolean;
  /** `high` para posições da carteira e gráfico aberto; `low` para o mercado. */
  priority?: LoadPriority;
}

/**
 * Estado do histórico de um ticker; cada componente entra quando o seu chega.
 * Desmontou antes da resposta: o resultado é ignorado (o pedido termina e fica
 * no cache para a próxima montagem — não há o que abortar no servidor).
 */
export function useTickerHistory(
  ticker: string,
  { enabled = true, priority = 'low' }: TickerHistoryOptions = {}
): TickerHistoryState {
  const [state, setState] = useState<TickerHistoryState>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState({ status: 'loading' });
    tickerHistoryLoader.load(ticker, priority).then(
      (data) => alive && setState({ status: 'ok', data }),
      () => alive && setState({ status: 'error' })
    );
    return () => {
      alive = false;
    };
  }, [ticker, enabled, priority]);

  return state;
}
