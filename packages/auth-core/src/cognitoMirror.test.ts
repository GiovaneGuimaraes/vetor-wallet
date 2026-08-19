import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário próprio deste arquivo. O client do `@vetor-wallet/db` lê
// DATABASE_URL no top-level do módulo, então o env é setado ANTES do
// `await import()` dinâmico — nunca com `import` estático (que é hoisted).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-cognito-mirror-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

type Mirror = typeof import('./cognitoMirror');
type Db = typeof import('@vetor-wallet/db');

describe('espelho da identidade do Cognito em `users` (T-106)', () => {
  let mirror: Mirror;
  let db: Db['db'];

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    await dbModule.initDb();
    db = dbModule.db;
    mirror = await import('./cognitoMirror');
  });

  it('cria o espelho com e-mail normalizado, sem senha local utilizável', async () => {
    const user = await mirror.createCognitoUser('  Nova@Example.COM ', 'sub-nova');
    expect(user.email).toBe('nova@example.com');
    expect(user.roles).toEqual([]);

    const row = await db.execute({
      sql: 'SELECT password_hash, cognito_sub FROM users WHERE id = ?',
      args: [user.id],
    });
    expect(row.rows[0].cognito_sub).toBe('sub-nova');
    expect(row.rows[0].password_hash).toBe(mirror.COGNITO_MANAGED_PASSWORD_HASH);

    // O sentinela não é bcrypt: nenhuma senha pode casar com ele.
    const { verifyPassword } = await import('./service');
    expect(
      await verifyPassword(
        'cognito-managed:no-local-password',
        mirror.COGNITO_MANAGED_PASSWORD_HASH
      )
    ).toBe(false);
  });

  it('cria a carteira padrão junto (T-050)', async () => {
    const user = await mirror.createCognitoUser('carteira@example.com', 'sub-carteira');
    const wallets = await db.execute({
      sql: 'SELECT id FROM wallets WHERE user_id = ?',
      args: [user.id],
    });
    expect(wallets.rows.length).toBe(1);
  });

  it('findUserByCognitoSub acha pelo sub e devolve null para sub desconhecido', async () => {
    await mirror.createCognitoUser('achado@example.com', 'sub-achado');
    const found = await mirror.findUserByCognitoSub('sub-achado');
    expect(found?.email).toBe('achado@example.com');
    expect(await mirror.findUserByCognitoSub('sub-que-nao-existe')).toBeNull();
  });

  it('sub já conhecido: acha o mesmo usuário, sem criar nada', async () => {
    const created = await mirror.createCognitoUser('conhecido@example.com', 'sub-conhecido');
    const result = await mirror.findOrCreateUserByCognitoSub({
      cognitoSub: 'sub-conhecido',
      email: 'conhecido@example.com',
      emailVerified: true,
    });
    expect(result.outcome).toBe('found-by-sub');
    expect(result.user.id).toBe(created.id);
  });

  it('sub novo com e-mail já existente: VINCULA à conta antiga e preserva os dados', async () => {
    // Conta "pré-Cognito": nasce por createUser (bcrypt, sem cognito_sub) e com
    // dado do usuário pendurado nela.
    const { createUser } = await import('./service');
    const legacy = await createUser('antigo@example.com', 'senha-antiga-1');
    await db.execute({
      sql: 'INSERT INTO income_sources (user_id, name, amount) VALUES (?, ?, ?)',
      args: [legacy.id, 'Salario', 100],
    });

    const result = await mirror.findOrCreateUserByCognitoSub({
      cognitoSub: 'sub-antigo',
      email: 'antigo@example.com',
      emailVerified: true,
    });

    expect(result.outcome).toBe('linked-by-email');
    expect(result.user.id).toBe(legacy.id);

    const row = await db.execute({
      sql: 'SELECT cognito_sub FROM users WHERE id = ?',
      args: [legacy.id],
    });
    expect(row.rows[0].cognito_sub).toBe('sub-antigo');

    // O dado continua no lugar: nada foi recriado.
    const income = await db.execute({
      sql: 'SELECT COUNT(*) as n FROM income_sources WHERE user_id = ?',
      args: [legacy.id],
    });
    expect(Number(income.rows[0].n)).toBe(1);

    // E o segundo login já acha pelo sub.
    const again = await mirror.findOrCreateUserByCognitoSub({
      cognitoSub: 'sub-antigo',
      email: 'antigo@example.com',
      emailVerified: true,
    });
    expect(again.outcome).toBe('found-by-sub');
    expect(again.user.id).toBe(legacy.id);
  });

  it('vincula mesmo com caixa e espaços diferentes no e-mail do pool', async () => {
    const { createUser } = await import('./service');
    const legacy = await createUser('caixa@example.com', 'senha-antiga-1');

    const result = await mirror.findOrCreateUserByCognitoSub({
      cognitoSub: 'sub-caixa',
      email: '  Caixa@Example.COM ',
      emailVerified: true,
    });

    expect(result.outcome).toBe('linked-by-email');
    expect(result.user.id).toBe(legacy.id);

    // Não nasceu conta paralela com o e-mail em outra caixa.
    const all = await db.execute({
      sql: "SELECT COUNT(*) as n FROM users WHERE lower(email) = 'caixa@example.com'",
      args: [],
    });
    expect(Number(all.rows[0].n)).toBe(1);
  });

  // `emailVerified: false` de propósito: criar espelho NOVO não precisa de
  // e-mail verificado — não há conta de ninguém para assumir, a linha nasce vazia
  // e pertence a quem acabou de se cadastrar. O que é gated é o vínculo.
  it('sub novo e e-mail novo: cria o espelho mesmo sem e-mail verificado', async () => {
    const result = await mirror.findOrCreateUserByCognitoSub({
      cognitoSub: 'sub-inedito',
      email: 'Inedito@Example.com',
      emailVerified: false,
    });
    expect(result.outcome).toBe('created');
    expect(result.user.email).toBe('inedito@example.com');
    expect((await mirror.findUserByCognitoSub('sub-inedito'))?.id).toBe(result.user.id);
  });

  it('linkCognitoSub sobrescreve um sub anterior (conta recriada no pool)', async () => {
    const user = await mirror.createCognitoUser('recriado@example.com', 'sub-velho');
    await mirror.linkCognitoSub(user.id, ' sub-novo ');
    expect(await mirror.findUserByCognitoSub('sub-velho')).toBeNull();
    expect((await mirror.findUserByCognitoSub('sub-novo'))?.id).toBe(user.id);
  });

  it('dois usuários não podem compartilhar o mesmo cognito_sub (índice único)', async () => {
    await mirror.createCognitoUser('dono@example.com', 'sub-exclusivo');
    await expect(
      mirror.createCognitoUser('intruso@example.com', 'sub-exclusivo')
    ).rejects.toThrow();
  });

  // Achado da revisão da T-106: sem esta trava, quem soubesse o e-mail da vítima
  // se cadastrava no pool com aquele e-mail e recebia a conta dela.
  describe('vínculo por e-mail EXIGE e-mail verificado no provedor', () => {
    it('recusa o vínculo, não cria sessão nem grava cognito_sub em ninguém', async () => {
      const { createUser } = await import('./service');
      const vitima = await createUser('vitima@example.com', 'senha-antiga-1');

      await expect(
        mirror.findOrCreateUserByCognitoSub({
          cognitoSub: 'sub-do-atacante',
          email: 'vitima@example.com',
          emailVerified: false,
        })
      ).rejects.toBeInstanceOf(mirror.CognitoLinkRequiresVerifiedEmailError);

      // A vítima segue sem `sub`: o vínculo foi checado ANTES de qualquer escrita.
      const row = await db.execute({
        sql: 'SELECT cognito_sub FROM users WHERE id = ?',
        args: [vitima.id],
      });
      expect(row.rows[0].cognito_sub).toBeNull();

      // E o `sub` do atacante não existe em lugar nenhum — nem numa conta nova.
      expect(await mirror.findUserByCognitoSub('sub-do-atacante')).toBeNull();
      const users = await db.execute({
        sql: "SELECT COUNT(*) as n FROM users WHERE lower(email) = 'vitima@example.com'",
        args: [],
      });
      expect(Number(users.rows[0].n)).toBe(1);
    });

    it('recusa também quando a caixa do e-mail difere (o casamento é normalizado)', async () => {
      const { createUser } = await import('./service');
      const vitima = await createUser('caixa-vitima@example.com', 'senha-antiga-1');

      await expect(
        mirror.findOrCreateUserByCognitoSub({
          cognitoSub: 'sub-atacante-2',
          email: '  Caixa-Vitima@EXAMPLE.com ',
          emailVerified: false,
        })
      ).rejects.toBeInstanceOf(mirror.CognitoLinkRequiresVerifiedEmailError);

      const row = await db.execute({
        sql: 'SELECT cognito_sub FROM users WHERE id = ?',
        args: [vitima.id],
      });
      expect(row.rows[0].cognito_sub).toBeNull();
    });

    it('com e-mail verificado o MESMO vínculo passa (a trava não quebra o caso legítimo)', async () => {
      const { createUser } = await import('./service');
      const dono = await createUser('dono-legitimo@example.com', 'senha-antiga-1');

      const result = await mirror.findOrCreateUserByCognitoSub({
        cognitoSub: 'sub-dono-legitimo',
        email: 'dono-legitimo@example.com',
        emailVerified: true,
      });

      expect(result.outcome).toBe('linked-by-email');
      expect(result.user.id).toBe(dono.id);
      expect((await mirror.findUserByCognitoSub('sub-dono-legitimo'))?.id).toBe(dono.id);
    });

    it('o erro não vaza senha nem sub, e nomeia o e-mail para o log', async () => {
      const err = new mirror.CognitoLinkRequiresVerifiedEmailError('alguem@example.com');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('CognitoLinkRequiresVerifiedEmailError');
      expect(err.email).toBe('alguem@example.com');
      expect(err.message).toContain('alguem@example.com');
    });
  });
});
