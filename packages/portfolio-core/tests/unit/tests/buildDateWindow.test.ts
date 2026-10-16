import { buildDateWindow } from 'src/buildDateWindow';

// Portado do Vitest (portfolioHistory.test.ts) na T-104, fatia 2/2 — assertivas intactas.
describe('buildDateWindow', () => {
  it('returns `days` dates ending at endDate, ascending', () => {
    expect(buildDateWindow('2026-07-03', 3)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });

  it('days = 1 returns only the end date', () => {
    expect(buildDateWindow('2026-07-03', 1)).toEqual(['2026-07-03']);
  });
});
