/**
 * Movimentação interna × gasto real (T-088).
 *
 * O dry-run real da T-087 mostrou que importar "como vem" produz um mês
 * irreconhecível — e nenhum dos casos é bug do importador, é o app não ter o
 * conceito de **movimentação interna**: dinheiro que sai de um bolso do humano
 * para outro bolso do mesmo humano não é despesa nem renda, é o mesmo
 * patrimônio mudando de lugar.
 *
 * Três defeitos medidos, todos com a mesma raiz:
 *
 * 1. **Aplicação em reserva** entrava como despesa — era a maior parte do
 *    volume de débito do mês, então a despesa aparecia vários múltiplos acima
 *    do gasto real.
 * 2. O **resgate** dessa reserva entrava como renda.
 * 3. O **pagamento da fatura** do cartão contava **duas vezes**: despesa na
 *    conta e renda no cartão (quem importa conta + cartão importa as duas
 *    pontas da mesma transferência).
 *
 * O sinal para decidir é a `category` da Pluggy, que **vem preenchida no Meu
 * Pluggy gratuito** (medido contra a API real em 2026-08-12; ver
 * `packages/pluggy-core/CLAUDE.md`). É o único campo limpo disponível — a
 * descrição é texto livre de cada banco.
 */

/**
 * Motivo pelo qual a linha não vira lançamento. Vai inteiro para o relatório,
 * em pt-BR, porque quem lê o `--dry-run` precisa entender por que uma linha que
 * ele VÊ no extrato não aparece no app.
 */
export type InternalMovementReason = string;

/**
 * As categorias da Pluggy que **não** viram lançamento, e o motivo de cada uma.
 *
 * Chave em minúsculas — a comparação é case-insensitive (ver
 * `classifyInternalMovement`).
 *
 * **`Transfers` está deliberadamente FORA desta lista.** É a categoria
 * guarda-chuva da Pluggy e cobre transferência para **terceiros**: um PIX pago
 * a outra pessoa é despesa real, e uma transferência recebida é renda real.
 * Pular a guarda-chuva sumiria com dinheiro de verdade em silêncio — o oposto
 * do defeito que esta tarefa conserta. Só as folhas específicas entram aqui.
 */
export const INTERNAL_MOVEMENT_CATEGORIES: Readonly<Record<string, InternalMovementReason>> =
  Object.freeze({
    'same person transfer':
      'Transferência entre contas do próprio titular — não é despesa nem renda',
    'credit card payment': 'Pagamento de fatura do cartão — a despesa já são as compras do cartão',
    investments:
      'Aplicação/resgate de investimento — pertence ao layer de investimentos, não a despesas',
  });

/**
 * `category` da Pluggy → motivo de não importar, ou `null` se é lançamento real.
 *
 * Decisões travadas:
 *
 * - **Comparação por igualdade normalizada** (trim + minúsculas + espaços
 *   internos colapsados), não por `includes`/prefixo. `includes('transfer')`
 *   pegaria a guarda-chuva `Transfers` e toda transferência a terceiros junto;
 *   uma lista fechada de folhas é auditável e não cresce sozinha.
 * - **NÃO usa `normalizeCategory`** (T-028) para casar: aquela função existe
 *   para agrupar categorias de despesa na UI e pode mudar de regra por motivos
 *   de apresentação. Amarrar a decisão "isto é dinheiro do mês ou não" à
 *   normalização de exibição faria um ajuste de UI mudar, em silêncio, quanto o
 *   humano gastou no mês.
 * - **Categoria desconhecida ou ausente é lançamento normal** (fail OPEN), ao
 *   contrário do gate de assinatura ou do `ENVIRONMENT` da Pluggy, que falham
 *   fechado. Aqui a assimetria é deliberada: o desfecho de errar para o lado
 *   fechado seria **não importar despesa real** — o mês ficaria menor que a
 *   verdade e o humano não teria como perceber a ausência. Errar para o lado
 *   aberto reimporta uma movimentação interna que ele VÊ no relatório e pode
 *   apagar. Consequência aceita: se a Pluggy renomear um rótulo, o defeito
 *   volta até alguém atualizar esta lista.
 */
export function classifyInternalMovement(
  category: string | null | undefined
): InternalMovementReason | null {
  if (!category) return null;
  const key = category.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  return INTERNAL_MOVEMENT_CATEGORIES[key] ?? null;
}
