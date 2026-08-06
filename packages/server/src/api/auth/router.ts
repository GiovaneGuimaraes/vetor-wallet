import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { db } from '../../db';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  userExists,
  parseRoles,
  isValidEmail,
  isValidName,
  isValidPhone,
  updateUserProfile,
  findUserById,
  updateUserPassword,
} from './service';

const router = Router();

router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'E-mail obrigatorio' });
      return;
    }
    if (!isValidEmail(email.trim())) {
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
    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      created_at: user.created_at,
      roles: user.roles,
    });
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
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      created_at: user.created_at,
      roles: user.roles,
    });
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
      sql: 'SELECT id, email, name, phone, created_at, roles FROM users WHERE id = ?',
      args: [req.session.userId],
    });
    if (result.rows.length === 0) {
      req.session.destroy(() => null);
      res.status(401).json({ error: 'Sessao invalida' });
      return;
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      phone: row.phone ?? null,
      created_at: row.created_at,
      roles: parseRoles(row.roles),
    });
  }),
);

router.patch(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Nao autenticado' });
      return;
    }

    const body = req.body as { name?: string | null; phone?: string | null };
    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone');

    if (!hasName && !hasPhone) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }

    if (hasName && body.name !== null) {
      const name = body.name;
      if (typeof name !== 'string' || !isValidName(name)) {
        res.status(400).json({ error: 'Nome invalido' });
        return;
      }
    }

    if (hasPhone && body.phone !== null) {
      if (typeof body.phone !== 'string' || !isValidPhone(body.phone)) {
        res.status(400).json({ error: 'Telefone invalido' });
        return;
      }
    }

    const update: { name?: string | null; phone?: string | null } = {};
    if (hasName) update.name = body.name === null ? null : (body.name as string).trim();
    if (hasPhone) update.phone = body.phone === null ? null : body.phone;

    const user = await updateUserProfile(req.session.userId, update);
    if (!user) {
      req.session.destroy(() => null);
      res.status(401).json({ error: 'Sessao invalida' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      created_at: user.created_at,
      roles: user.roles,
    });
  }),
);

// T-094: troca de senha na page /conta. Mensagem genérica na senha atual
// errada (não distingue "usuário não existe" de "senha errada" — o usuário
// já está autenticado, mas mantemos o mesmo cuidado do login). Não toca na
// sessão atual: o usuário segue logado após trocar a senha.
router.post(
  '/change-password',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Nao autenticado' });
      return;
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Senha atual e nova senha sao obrigatorias' });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
      return;
    }

    const user = await findUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => null);
      res.status(401).json({ error: 'Sessao invalida' });
      return;
    }

    const currentOk = await verifyPassword(currentPassword, user.password_hash);
    if (!currentOk) {
      res.status(400).json({ error: 'Senha atual invalida' });
      return;
    }

    await updateUserPassword(user.id, newPassword);
    res.status(204).send();
  }),
);

export default router;
