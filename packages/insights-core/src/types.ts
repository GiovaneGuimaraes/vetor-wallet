/** Taxa diária do CDI como o BCB devolve: data `dd/mm/yyyy` e valor em % com vírgula. */
export interface BcbRateRow {
  data: string;
  valor: string;
}

/** Ponto de histórico da brapi: `date` é epoch em SEGUNDOS, `close` o fechamento. */
export interface BrapiHistoryPoint {
  date: number;
  close: number;
}
