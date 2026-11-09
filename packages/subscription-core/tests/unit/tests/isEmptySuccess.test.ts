import { AbacatePayError } from 'src/providers/abacatepay/AbacatePayError';
import { isEmptySuccess } from 'src/providers/abacatepay/isEmptySuccess';

const err = (status: number, body?: unknown) => {
  return new AbacatePayError('x', status, body);
};

describe('isEmptySuccess', () => {
  test.each([
    ['200 com data nula e sem error', err(200, { data: null, error: null, success: true }), true],
    ['204 só com data nula', err(204, { data: null }), true],
    ['299 é 2xx', err(299, { data: null }), true],
    ['200 com success:false', err(200, { data: null, error: null, success: false }), false],
    ['200 com error preenchido', err(200, { data: null, error: 'recusado' }), false],
    ['200 com data presente (não é o caso)', err(200, { data: { id: 1 } }), false],
    ['200 sem corpo (não-JSON)', err(200, undefined), false],
    ['200 com corpo não-objeto', err(200, 'texto'), false],
    ['400', err(400, { data: null }), false],
    ['300', err(300, { data: null }), false],
    ['199', err(199, { data: null }), false],
    ['0 (rede)', err(0), false],
    ['erro que não é AbacatePayError', new Error('x'), false],
    ['não é erro', { status: 200, body: { data: null } }, false],
  ])('%s → %s', (_l, value, expected) => {
    expect(isEmptySuccess(value)).toBe(expected);
  });
});
