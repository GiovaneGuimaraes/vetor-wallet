import { nowSqliteUtc } from 'src/nowSqliteUtc';

describe('nowSqliteUtc', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('devolve o instante atual no formato do banco', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T10:20:30.500Z'));
    expect(nowSqliteUtc()).toBe('2026-08-08 10:20:30');
  });
});
