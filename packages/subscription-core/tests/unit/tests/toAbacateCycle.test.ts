import type { PlanInterval } from '@vetor-wallet/shared';
import { toAbacateCycle } from 'src/providers/abacatepay/toAbacateCycle';

describe('toAbacateCycle', () => {
  test('mensal vira MONTHLY', () => {
    expect(toAbacateCycle('monthly')).toBe('MONTHLY');
  });

  test('anual vira ANNUALLY (não YEARLY)', () => {
    expect(toAbacateCycle('yearly')).toBe('ANNUALLY');
  });

  test('lança para intervalo fora do tipo em vez de devolver undefined', () => {
    expect(() => toAbacateCycle('weekly' as PlanInterval)).toThrow('weekly');
  });
});
