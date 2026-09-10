import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '@vetor-wallet/db';
import { parseRoles } from '@vetor-wallet/auth-core';

declare module 'express-session' {
  interface SessionData {
    userId: number;
    /**
     * Tokens do Cognito da T-106. Vivem na sessão do SERVIDOR (SQLite, via
     * `SqliteSessionStore`) — o cookie só carrega o `sid`, então nenhum token
     * chega ao browser. Opcionais porque sessões criadas antes da T-106
     * continuam válidas (o `requireAuth` só olha `userId`); quem precisa do
     * token é a troca de senha, que responde `COGNITO_SESSION_REQUIRED` quando
     * ele não está lá.
     */
    cognitoAccessToken?: string;
    cognitoRefreshToken?: string;
    /**
     * O `sub` do usuário no pool, guardado porque o `SECRET_HASH` do fluxo de
     * refresh é calculado sobre ele e a request de refresh não o carrega.
     *
     * **É o `sub`, não o e-mail** — e a diferença não é cosmética. Confirmado
     * contra o pool real em 2026-09-09: no `REFRESH_TOKEN_AUTH` o hash sobre o
     * e-mail é recusado com `NotAuthorizedException` e o hash sobre o `sub`
     * passa. Todas as outras chamadas usam o e-mail; só esta foge do padrão.
     *
     * Sessão criada antes desta correção não tem o campo: a troca de senha com
     * token vencido responde "Senha atual invalida" nela, e um login novo
     * resolve. Preferido a inventar um `sub` a partir do e-mail guardado.
     */
    cognitoSub?: string;
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
