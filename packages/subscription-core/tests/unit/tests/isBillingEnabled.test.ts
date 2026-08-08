import { isBillingEnabled } from 'src/isBillingEnabled';

describe('isBillingEnabled', () => {
  test("é true só com BILLING_ENABLED === 'true'", () => {
    process.env.BILLING_ENABLED = 'true';
    expect(isBillingEnabled()).toBe(true);
  });

  test('ignora espaço em volta', () => {
    process.env.BILLING_ENABLED = '  true  ';
    expect(isBillingEnabled()).toBe(true);
  });

  test.each(['false', '1', 'TRUE', ''])('%p não liga o billing', (value) => {
    process.env.BILLING_ENABLED = value;
    expect(isBillingEnabled()).toBe(false);
  });

  test('flag ausente conta como desligada (default seguro para staging)', () => {
    delete process.env.BILLING_ENABLED;
    expect(isBillingEnabled()).toBe(false);
  });
});
