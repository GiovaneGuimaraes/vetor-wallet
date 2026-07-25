/**
 * Higiene do fetch mensal (T-049): dedupe de requests concorrentes para o
 * MESMO mês, em `DespesasPage`/`RendaPage`. Complementa (não substitui) a
 * guarda de "resposta obsoleta" da T-030 (`latestRequestedMonthRef`): aquela
 * decide qual resposta feita VALE quando duas chegam fora de ordem; esta
 * decide se uma nova requisição precisa ser DISPARADA quando já existe uma
 * em andamento para o mesmo mês (ex.: o efeito de busca do mês reexecutando
 * duas vezes em StrictMode, ou dois disparos muito próximos apontando para o
 * mesmo valor de mês).
 *
 * Extraída como classe pura (sem estado de componente) para poder ser
 * testada sem DOM/React.
 */
export class MonthFetchGuard {
  private inFlightMonth: string | null = null;

  /** `true` quando já existe uma requisição em andamento para este mês. */
  isInFlight(month: string): boolean {
    return this.inFlightMonth === month;
  }

  /** Marca `month` como tendo uma requisição em andamento. */
  start(month: string): void {
    this.inFlightMonth = month;
  }

  /**
   * Libera `month` ao final da requisição. Só limpa se `month` ainda for o
   * mês em voo registrado — evita que a finalização de uma chamada antiga
   * apague o registro de uma chamada mais nova para outro mês.
   */
  finish(month: string): void {
    if (this.inFlightMonth === month) {
      this.inFlightMonth = null;
    }
  }
}
