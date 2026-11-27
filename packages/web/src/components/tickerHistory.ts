import { useEffect, useState } from 'react';
import type { TickerHistory } from '@vetor-wallet/shared';
import { getTickerHistory } from '../api';
import { createHistoryLoader } from '../routes/historyLoader';

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

/** Estado do histórico de um ticker; cada componente entra quando o seu chega. */
export function useTickerHistory(ticker: string): TickerHistoryState {
  const [state, setState] = useState<TickerHistoryState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    tickerHistoryLoader.load(ticker).then(
      (data) => alive && setState({ status: 'ok', data }),
      () => alive && setState({ status: 'error' })
    );
    return () => {
      alive = false;
    };
  }, [ticker]);

  return state;
}
