/**
 * Procedência das pernas de transferência da poupança (T-041).
 *
 * A T-041 criava um par WITHDRAW + DEPOSIT com um `transfer_group` comum para
 * reservar dinheiro numa meta. **Metas foi removida na T-091b1** (decisão do
 * humano) e a transferência deixou de existir: nada novo é gravado com
 * `transfer_group`, e todo o cálculo de "saldo livre"/"reservado em metas" que
 * morava aqui saiu junto — **o saldo livre é o saldo**, e a tela lê
 * `summary.balance` direto (fonte única do server), sem derivar nada.
 *
 * O que sobrou é só a leitura do dado legado: pares gravados antes da remoção
 * continuam no banco e a lista os identifica com o selo `⇄`, no espírito do
 * `↻ recorrente` da T-035. Cada perna sempre foi editável/excluível sozinha.
 */

import type { SavingsEntry } from '@vetor-wallet/shared';

/** `true` quando o lançamento é uma das pernas de uma transferência legada. */
export function isTransferLeg(entry: SavingsEntry): boolean {
  return typeof entry.transfer_group === 'string' && entry.transfer_group.length > 0;
}
