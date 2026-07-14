import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../db';
import { parseRoles } from './service';

declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Nao autenticado' });
    return;
  }
  res.locals.userId = req.session.userId;
  next();
}

// Queries the DB on every request — roles granted via CLI take effect immediately.
export const requireAdmin: RequestHandler = (req, res, next) => {
  const userId = res.locals.userId as number;
  db.execute({ sql: 'SELECT roles FROM users WHERE id = ?', args: [userId] })
    .then((result) => {
      const roles = parseRoles(result.rows[0]?.roles);
      if (!roles.includes('admin')) {
        res.status(403).json({ error: 'Acesso restrito a administradores' });
        return;
      }
      next();
    })
    .catch(next);
};
