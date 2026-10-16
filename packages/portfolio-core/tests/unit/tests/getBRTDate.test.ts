import { getBRTDate } from 'src/getBRTDate';

// Portado do Vitest (snapshots.test.ts) na T-104, fatia 2/2 — assertivas intactas.
describe('getBRTDate', () => {
  it('returns a Date whose UTC hours match the BRT local hour', () => {
    // Freeze time at 21:15 UTC = 18:15 BRT
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-08T21:15:00Z'));

    const brt = getBRTDate();
    expect(brt.getUTCHours()).toBe(18);
    expect(brt.getUTCMinutes()).toBe(15);

    jest.useRealTimers();
  });
});
