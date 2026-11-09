import { abacatePayErrorText } from 'src/providers/abacatepay/abacatePayErrorText';

describe('abacatePayErrorText', () => {
  test.each([
    ['error string', { error: 'Product not found' }, 'Product not found'],
    ['error { message }', { error: { message: 'already exists' } }, 'already exists'],
    ['error { message } não-string', { error: { message: 42 } }, ''],
    ['error objeto sem message', { error: { code: 1 } }, ''],
    ['error nulo', { error: null }, ''],
    ['sem error', { data: null }, ''],
    ['corpo nulo', null, ''],
    ['corpo string', 'oops', ''],
  ])('%s', (_l, body, expected) => {
    expect(abacatePayErrorText(body)).toBe(expected);
  });
});
