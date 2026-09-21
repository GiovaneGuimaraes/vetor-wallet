import type { SavingsEntry } from '@vetor-wallet/shared';
import { summariseSavings } from 'src/summariseSavings';
import { computeBalance } from 'src/computeBalance';

function entry(type: SavingsEntry['type'], amount: number): SavingsEntry {
  return {
    id: 1,
    user_id: 1,
    type,
    amount,
    date: '2026-09-20',
    note: '',
    created_at: '2026-09-20T00:00:00.000Z',
  } as SavingsEntry;
}

describe('summariseSavings', () => {
  it('separa os três totais e devolve o saldo', () => {
    expect(
      summariseSavings([entry('DEPOSIT', 100), entry('YIELD', 2.5), entry('WITHDRAW', 40)])
    ).toEqual({ balance: 62.5, totalDeposits: 100, totalYield: 2.5, totalWithdrawals: 40 });
  });

  it('lista vazia zera tudo', () => {
    expect(summariseSavings([])).toEqual({
      balance: 0,
      totalDeposits: 0,
      totalYield: 0,
      totalWithdrawals: 0,
    });
  });

  it('o balance bate com computeBalance nos mesmos lançamentos (invariante T-052)', () => {
    const entries = [
      entry('DEPOSIT', 0.1),
      entry('DEPOSIT', 0.2),
      entry('YIELD', 0.1),
      entry('WITHDRAW', 0.05),
    ];
    expect(summariseSavings(entries).balance).toBe(computeBalance(entries));
    expect(summariseSavings(entries).balance).toBe(0.35);
  });

  it('ignora tipo desconhecido vindo do banco em vez de somá-lo ao saldo', () => {
    const estranho = { ...entry('DEPOSIT', 10), type: 'TRANSFER' } as unknown as SavingsEntry;
    expect(summariseSavings([entry('DEPOSIT', 10), estranho])).toEqual({
      balance: 10,
      totalDeposits: 10,
      totalYield: 0,
      totalWithdrawals: 0,
    });
  });
});
