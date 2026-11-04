import { parseRoles } from 'src/parseRoles';
import { serializeRoles } from 'src/serializeRoles';
import { toUser } from 'src/toUser';

describe('parseRoles', () => {
  it('lê um array JSON', () => {
    expect(parseRoles('["admin"]')).toEqual(['admin']);
  });

  it('fail-safe: não-string, JSON inválido e não-array viram []', () => {
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles(undefined)).toEqual([]);
    expect(parseRoles('{nao-json')).toEqual([]);
    expect(parseRoles('{"a":1}')).toEqual([]);
  });
});

describe('serializeRoles', () => {
  it('faz ida e volta com parseRoles', () => {
    expect(parseRoles(serializeRoles(['admin', 'x']))).toEqual(['admin', 'x']);
  });
});

describe('toUser', () => {
  it('converte nulos ausentes em null e faz o parse dos papéis', () => {
    const row = {
      id: 1,
      email: 'a@b.com',
      created_at: 'c',
      roles: '["admin"]',
    } as unknown as Parameters<typeof toUser>[0];
    expect(toUser(row)).toEqual({
      id: 1,
      email: 'a@b.com',
      name: null,
      phone: null,
      created_at: 'c',
      roles: ['admin'],
    });
  });

  it('preserva name e phone presentes', () => {
    const user = toUser({
      id: 2,
      email: 'x@y.com',
      name: 'Ana',
      phone: '11912345678',
      created_at: 'c',
      roles: '[]',
    });
    expect(user.name).toBe('Ana');
    expect(user.phone).toBe('11912345678');
  });
});
