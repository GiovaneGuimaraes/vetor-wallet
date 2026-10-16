import { isBusinessDay } from 'src/isBusinessDay';

// Portado do Vitest (snapshots.test.ts) na T-104, fatia 2/2 — assertivas intactas.
describe('isBusinessDay', () => {
  it('returns false for Saturday', () => {
    // 2024-01-06 is a Saturday — shift to BRT representation
    const sat = new Date('2024-01-06T15:00:00Z'); // noon BRT (UTC-3)
    expect(isBusinessDay(sat)).toBe(false);
  });

  it('returns false for Sunday', () => {
    const sun = new Date('2024-01-07T15:00:00Z');
    expect(isBusinessDay(sun)).toBe(false);
  });

  it('returns true for Monday', () => {
    const mon = new Date('2024-01-08T15:00:00Z');
    expect(isBusinessDay(mon)).toBe(true);
  });

  it('returns true for Friday', () => {
    const fri = new Date('2024-01-12T15:00:00Z');
    expect(isBusinessDay(fri)).toBe(true);
  });
});
