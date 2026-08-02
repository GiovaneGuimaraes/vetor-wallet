/**
 * Aviso não-bloqueante de saque acima do saldo da poupança (T-079).
 *
 * O server aceita `WITHDRAW` acima do saldo por decisão documentada
 * (`docs/decisions/savings-goals.md`) — a permissividade é intencional e
 * fora de escopo mudar. Mas a UI ficava muda diante de um erro de digitação
 * (ex.: saque de R$ 99.999 com saldo de R$ 5.042 passava sem qualquer
 * aviso), gerando saldo negativo em silêncio. Este módulo só decide **se
 * mostra o aviso** antes do POST — a permissão de fato continua inteiramente
 * do server, nada aqui bloqueia o envio depois da confirmação.
 *
 * Comparação em centavos inteiros (padrão T-041/T-052): comparar floats
 * direto arrisca falso positivo/negativo bem na igualdade saque === saldo.
 */

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * `true` quando um `WITHDRAW` de `amount` deixaria o saldo negativo — isto é,
 * `amount > balance` (sacar exatamente o saldo zera, não é excedente e não
 * deve pedir confirmação).
 */
export function wouldOverdrawBalance(amount: number, balance: number): boolean {
  return toCents(amount) > toCents(balance);
}
