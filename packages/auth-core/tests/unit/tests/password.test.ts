import { hashPassword } from 'src/hashPassword';
import { updateUserPassword } from 'src/updateUserPassword';
import { verifyPassword } from 'src/verifyPassword';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('hashPassword / verifyPassword', () => {
  it('gera hash que verifica e recusa senha errada', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('cada hash é único (salt aleatório)', async () => {
    expect(await hashPassword('x1234567')).not.toBe(await hashPassword('x1234567'));
  });

  it('o sentinela do Cognito não casa com nenhuma senha', async () => {
    expect(await verifyPassword('qualquer', 'cognito-managed:no-local-password')).toBe(false);
  });
});

describe('updateUserPassword', () => {
  it('grava o hash (não a senha) no usuário certo', async () => {
    const { query, calls } = makeTestQuery();
    await updateUserPassword({ query, userId: 9, newPassword: 'nova-senha-1' });
    expect(calls[0].text).toBe('UPDATE users SET password_hash = $1 WHERE id = $2');
    const [hash, id] = calls[0].values as [string, number];
    expect(id).toBe(9);
    expect(hash).not.toBe('nova-senha-1');
    expect(await verifyPassword('nova-senha-1', hash)).toBe(true);
  });
});
