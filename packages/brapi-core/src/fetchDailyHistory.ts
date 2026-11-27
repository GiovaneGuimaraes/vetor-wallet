import type { TickerHistory } from '@vetor-wallet/shared';
import { enqueueBrapi } from './brapiQueue';
import { requestDailyHistory } from './requestDailyHistory';

/**
 * TTL do cache em memória do histórico diário, por ticker: 12 h. O dado é de
 * fechamento DIÁRIO — um gráfico de 3 meses não muda de forma perceptível ao
 * longo do pregão — e cada 200 da brapi gasta 1 da cota mensal (15.000). Com
 * 12 h, cada ticker custa no máximo ~2 requisições por dia, não importa
 * quantos usuários ou visitas (o cache é do processo, compartilhado). O último
 * ponto pode ficar até 12 h atrás do pregão — o web mostra o preço do dia pela
 * cotação (5 min) e o `fetchedAt` deixa isso honesto.
 */
export const HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const cache = new Map<string, { value: TickerHistory; expiresAt: number }>();
const inFlight = new Map<string, Promise<TickerHistory>>();

/** Só para teste. */
export function _resetHistoryCache(): void {
  cache.clear();
  inFlight.clear();
}

/**
 * Histórico diário de 3 meses de um ticker: cache (12 h) → Promise já em voo →
 * nova requisição na fila GLOBAL da brapi (a mesma das cotações: nunca 2
 * chamadas em voo), com prioridade BAIXA: cotação passa na frente. Erro NÃO é
 * cacheado (a próxima chamada tenta de novo); resposta 200 sem pontos é cacheada (gastou cota, e repetir não muda nada).
 * LANÇA o erro da requisição — quem decide degradar é a rota.
 */
export function fetchDailyHistory(ticker: string): Promise<TickerHistory> {
  const hit = cache.get(ticker);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);

  const pending = inFlight.get(ticker);
  if (pending) return pending;

  // A entrada sai de `inFlight` ANTES de a Promise assentar: quem chega depois
  // de uma falha faz pedido novo em vez de reaproveitar a Promise rejeitada.
  const forget = () => {
    if (inFlight.get(ticker) === p) inFlight.delete(ticker);
  };
  const p: Promise<TickerHistory> = enqueueBrapi(() => requestDailyHistory(ticker), 'history').then(
    (value) => {
      forget();
      cache.set(ticker, { value, expiresAt: Date.now() + HISTORY_CACHE_TTL_MS });
      return value;
    },
    (err: unknown) => {
      forget();
      throw err;
    }
  );
  inFlight.set(ticker, p);
  return p;
}
