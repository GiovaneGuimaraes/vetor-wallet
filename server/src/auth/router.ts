import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { db } from '../db';
import { createUser, findUserByEmail, verifyPassword, userExists, parseRoles } from './service';

const router = Router();

router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'E-mail obrigatorio' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'E-mail invalido' });
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
      return;
    }

    if (await userExists(email)) {
      res.status(409).json({ error: 'E-mail ja cadastrado' });
      return;
    }

    const user = await createUser(email, password);
    req.session.userId = user.id;
    res.status(201).json({ id: user.id, email: user.email, roles: user.roles });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha obrigatorios' });
      return;
    }

    const user = await findUserByEmail(email);
    // Always hash-compare to prevent timing attacks that leak user existence
    const dummyHash = '$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const passwordOk = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, dummyHash).then(() => false);
    if (!user || !passwordOk) {
      res.status(401).json({ error: 'E-mail ou senha invalidos' });
      return;
    }

    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email, roles: user.roles });
  }),
);

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.status(204).send();
  });
});

router.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Nao autenticado' });
      return;
    }
    const result = await db.execute({
      sql: 'SELECT id, email, created_at, roles FROM users WHERE id = ?',
      args: [req.session.userId],
    });
    if (result.rows.length === 0) {
      req.session.destroy(() => null);
      res.status(401).json({ error: 'Sessao invalida' });
      return;
    }
    const row = result.rows[0];
    res.json({ id: row.id, email: row.email, roles: parseRoles(row.roles) });
  }),
);

export default router;
