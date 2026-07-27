/**
 * Higiene do fetch mensal (T-049): dedupe de requests concorrentes para o
 * MÊS MAIS RECENTE EM VOO, em `DespesasPage`/`RendaPage`. Complementa (não
 * substitui) a guarda de "resposta obsoleta" da T-030
 * (`latestRequestedMonthRef`): aquela decide qual resposta feita VALE quando
 * duas chegam fora de ordem; esta decide se uma nova requisição precisa ser
 * DISPARADA quando já existe uma em andamento para o mesmo mês (ex.: o efeito
 * de busca do mês reexecutando duas vezes em StrictMode, ou dois disparos
 * muito próximos apontando para o mesmo valor de mês).
 *
 * Rastreia só UM mês por vez (o mais recente a iniciar), não um conjunto: uma
 * vez que `refreshEntries` só se importa com o mês exibido no momento, não há
 * necessidade de lembrar de fetches antigos que já deixaram de importar — ver
 * `finish()` abaixo.
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

  /** Marca `month` como o mês em voo (substitui qualquer mês anterior). */
  start(month: string): void {
    this.inFlightMonth = month;
  }

  /**
   * Libera `month` ao final da requisição. Só limpa se `month` ainda for o
   * mês em voo registrado — evita que a finalização de uma chamada antiga
   * apague o registro de uma chamada mais nova para outro mês (que já
   * substituiu esta como o único mês rastreado).
   */
  finish(month: string): void {
    if (this.inFlightMonth === month) {
      this.inFlightMonth = null;
    }
  }

  /**
   * Decide se um fetch para `month` deve prosseguir (T-054). Encapsula o par
   * `isInFlight` + `start` que `refreshEntries` já fazia manualmente — e
   * acrescenta `force`, para o caminho de RECONCILIAÇÃO após falha de delete
   * em `DespesasPage`/`RendaPage`: lá o item já foi removido da lista de
   * forma otimista, e o refetch de reconciliação precisa rodar mesmo que o
   * dedupe ache que já existe um fetch em voo para o mesmo mês (ex.: o efeito
   * de carga inicial ainda não resolveu) — sem isso, o dedupe engoliria esse
   * refetch e a remoção otimista indevida ficaria sem correção na tela.
   *
   * Retorna `true` (e já marca `month` como em voo) quando o fetch deve
   * disparar; `false` quando deve ser pulado por já haver um em andamento.
   */
  shouldFetch(month: string, options?: { force?: boolean }): boolean {
    if (!options?.force && this.isInFlight(month)) return false;
    this.start(month);
    return true;
  }
}
