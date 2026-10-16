import { shiftDate } from 'src/shiftDate';

// Portado do Vitest (portfolioHistory.test.ts) na T-104, fatia 2/2 — assertivas intactas.
describe('shiftDate', () => {
  it('shifts across a month boundary', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29'); // bissexto
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-07-10', 0)).toBe('2026-07-10');
  });
});
