import { describe, it, expect } from 'vitest';
import { resolveWalletChip } from './walletChip';
import type { PortfolioSummary } from '@vetor-wallet/shared';

function summary(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    positions: [],
    totalInvested: 1000,
    totalCurrentValue: 1100,
    totalProfitLoss: 100,
    totalProfitLossPct: 10,
    ...overrides,
  };
}

describe('resolveWalletChip', () => {
  it('uses dayProfitLossPct labeled "hoje" when available', () => {
    const chip = resolveWalletChip(summary({ dayProfitLossPct: 2.5 }));
    expect(chip).toEqual({ pct: 2.5, label: 'hoje', isProfit: true });
  });

  it('falls back to totalProfitLossPct labeled "total" when dayProfitLossPct is null', () => {
    const chip = resolveWalletChip(summary({ dayProfitLossPct: null, totalProfitLossPct: 10 }));
    expect(chip).toEqual({ pct: 10, label: 'total', isProfit: true });
  });

  it('falls back to "total" when dayProfitLossPct is absent (undefined)', () => {
    const chip = resolveWalletChip(summary({ totalProfitLossPct: -5 }));
    expect(chip).toEqual({ pct: -5, label: 'total', isProfit: false });
  });

  it('defaults to 0/"total" when summary is undefined', () => {
    const chip = resolveWalletChip(undefined);
    expect(chip).toEqual({ pct: 0, label: 'total', isProfit: true });
  });

  it('marks isProfit=false for negative day P&L', () => {
    const chip = resolveWalletChip(summary({ dayProfitLossPct: -1.2 }));
    expect(chip.isProfit).toBe(false);
  });

  it('treats dayProfitLossPct of exactly 0 as "hoje" data (not missing)', () => {
    const chip = resolveWalletChip(summary({ dayProfitLossPct: 0 }));
    expect(chip).toEqual({ pct: 0, label: 'hoje', isProfit: true });
  });
});
