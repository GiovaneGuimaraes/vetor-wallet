import { describe, it, expect } from 'vitest';
import type { SavingsEntry } from '@vetor-wallet/shared';
import { isTransferLeg } from './savingsTransfer';

let seq = 0;
function entry(partial: Partial<SavingsEntry>): SavingsEntry {
  seq += 1;
  return {
    id: seq,
    user_id: 1,
    type: 'DEPOSIT',
    amount: 0,
    date: '2026-01-01',
    note: '',
    created_at: '2026-01-01 00:00:00',
    transfer_group: null,
    ...partial,
  };
}

describe('isTransferLeg', () => {
  it('is true for an entry with a transfer group', () => {
    expect(isTransferLeg(entry({ transfer_group: 'abc-123' }))).toBe(true);
  });

  it('is false for a normal entry (null or absent)', () => {
    expect(isTransferLeg(entry({ transfer_group: null }))).toBe(false);
    expect(isTransferLeg(entry({ transfer_group: undefined }))).toBe(false);
  });

  it('is false for an empty string', () => {
    expect(isTransferLeg(entry({ transfer_group: '' }))).toBe(false);
  });
});
