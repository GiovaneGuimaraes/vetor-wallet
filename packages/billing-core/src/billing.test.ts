import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

// `billing.ts` importa `../../db`, cujo client lê DATABASE_URL no top-level do
// módulo — daí o env antes e o import dinâmico, mesmo os casos aqui sendo todos
// de funções puras (nenhum toca o banco).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-billing-svc-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type BillingModule = typeof import('./billing');

describe('billing service (funções puras)', () => {
  let billing: BillingModule;

  beforeAll(async () => {
    billing = await import('./billing');
  });

  describe('addInterval', () => {
    it('soma um mês mantendo dia e hora, em UTC', () => {
      expect(billing.addInterval('2026-08-01 12:34:56', 'monthly')).toBe('2026-09-01 12:34:56');
    });

    it('soma um ano', () => {
      expect(billing.addInterval('2026-08-01 12:34:56', 'yearly')).toBe('2027-08-01 12:34:56');
    });

    it('faz clamp de 31/01 para 28/02 (mês destino mais curto)', () => {
      expect(billing.addInterval('2026-01-31 10:00:00', 'monthly')).toBe('2026-02-28 10:00:00');
    });

    it('faz clamp de 31/03 para 30/04', () => {
      expect(billing.addInterval('2026-03-31 00:00:00', 'monthly')).toBe('2026-04-30 00:00:00');
    });

    it('faz clamp de 29/02 (bissexto) para 28/02 no ano seguinte', () => {
      expect(billing.addInterval('2028-02-29 08:00:00', 'yearly')).toBe('2029-02-28 08:00:00');
    });

    it('vira o ano quando soma um mês em dezembro', () => {
      expect(billing.addInterval('2026-12-15 23:59:59', 'monthly')).toBe('2027-01-15 23:59:59');
    });

    it('aceita entrada em ISO 8601 com Z e devolve o formato do SQLite', () => {
      expect(billing.addInterval('2026-08-01T12:00:00.000Z', 'monthly')).toBe(
        '2026-09-01 12:00:00',
      );
    });
  });

  describe('renewalBase', () => {
    it('usa o fim do período vigente quando ele está no futuro', () => {
      expect(billing.renewalBase('2026-08-01 00:00:00', '2026-09-10 00:00:00')).toBe(
        '2026-09-10 00:00:00',
      );
    });

    it('usa agora quando o período já venceu', () => {
      expect(billing.renewalBase('2026-08-01 00:00:00', '2026-07-01 00:00:00')).toBe(
        '2026-08-01 00:00:00',
      );
    });

    it('usa agora quando nunca houve período', () => {
      expect(billing.renewalBase('2026-08-01 00:00:00', null)).toBe('2026-08-01 00:00:00');
    });
  });

  describe('isSubscriptionActive', () => {
    const now = '2026-08-01 00:00:00';

    it('active com período no futuro é ativa', () => {
      expect(
        billing.isSubscriptionActive(
          { status: 'active', current_period_end: '2026-09-01 00:00:00' },
          now,
        ),
      ).toBe(true);
    });

    it('active com período vencido NÃO é ativa', () => {
      expect(
        billing.isSubscriptionActive(
          { status: 'active', current_period_end: '2026-07-31 23:59:59' },
          now,
        ),
      ).toBe(false);
    });

    it('pending nunca é ativa', () => {
      expect(
        billing.isSubscriptionActive(
          { status: 'pending', current_period_end: '2026-09-01 00:00:00' },
          now,
        ),
      ).toBe(false);
    });

    it('canceled nunca é ativa, mesmo dentro do período', () => {
      expect(
        billing.isSubscriptionActive(
          { status: 'canceled', current_period_end: '2026-09-01 00:00:00' },
          now,
        ),
      ).toBe(false);
    });

    it('expired e ausência de assinatura não são ativas', () => {
      expect(
        billing.isSubscriptionActive(
          { status: 'expired', current_period_end: '2026-09-01 00:00:00' },
          now,
        ),
      ).toBe(false);
      expect(billing.isSubscriptionActive(null, now)).toBe(false);
    });
  });

  it('toSqliteUtc formata em UTC no formato do SQLite (sem T e sem ms)', () => {
    expect(billing.toSqliteUtc(new Date('2026-08-01T05:06:07.890Z'))).toBe('2026-08-01 05:06:07');
    expect(billing.toSqliteUtc(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe(
      '2026-01-02 03:04:05',
    );
  });

  describe('safeEqual', () => {
    it('é true para strings iguais', () => {
      expect(billing.safeEqual('segredo', 'segredo')).toBe(true);
    });

    it('é false para strings diferentes do mesmo tamanho', () => {
      expect(billing.safeEqual('segredo', 'segreda')).toBe(false);
    });

    it('é false (sem lançar) para tamanhos diferentes', () => {
      expect(() => billing.safeEqual('a', 'abcdef')).not.toThrow();
      expect(billing.safeEqual('a', 'abcdef')).toBe(false);
      expect(billing.safeEqual('', 'x')).toBe(false);
    });
  });

  describe('isBillingEnabled', () => {
    it("só é true com BILLING_ENABLED === 'true'", () => {
      const original = process.env.BILLING_ENABLED;
      try {
        process.env.BILLING_ENABLED = 'true';
        expect(billing.isBillingEnabled()).toBe(true);
        process.env.BILLING_ENABLED = 'false';
        expect(billing.isBillingEnabled()).toBe(false);
        process.env.BILLING_ENABLED = '1';
        expect(billing.isBillingEnabled()).toBe(false);
        delete process.env.BILLING_ENABLED;
        expect(billing.isBillingEnabled()).toBe(false);
      } finally {
        if (original === undefined) delete process.env.BILLING_ENABLED;
        else process.env.BILLING_ENABLED = original;
      }
    });
  });
});
