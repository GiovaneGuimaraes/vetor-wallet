import type { SavingsEntry, SavingsSummary } from '@vetor-wallet/shared';
import { toCents } from './toCents';

/**
 * O `summary` de `GET /api/savings`: saldo e os três totais.
 *
 * Somado em centavos inteiros, alinhado a `computeBalance` — somar em float
 * direto pode divergir um centavo de
 * `balance = totalDeposits + totalYield - totalWithdrawals` em razões grandes.
 *
 * Desde a T-091b1 (Metas removida) o `balance` é também o saldo **livre**: não
 * há mais reserva a descontar. A T-091b2 apagou `goal_id` do banco; o legado que
 * sobrou é o `transfer_group` (T-041), que é só procedência e conta integral.
 */
export function summariseSavings(entries: SavingsEntry[]): SavingsSummary {
  let depositsCents = 0;
  let yieldCents = 0;
  let withdrawalsCents = 0;

  for (const entry of entries) {
    const cents = toCents(entry.amount);
    if (entry.type === 'DEPOSIT') depositsCents += cents;
    else if (entry.type === 'YIELD') yieldCents += cents;
    else if (entry.type === 'WITHDRAW') withdrawalsCents += cents;
  }

  return {
    balance: (depositsCents + yieldCents - withdrawalsCents) / 100,
    totalDeposits: depositsCents / 100,
    totalYield: yieldCents / 100,
    totalWithdrawals: withdrawalsCents / 100,
  };
}
