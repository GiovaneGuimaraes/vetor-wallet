import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { db } from '@vetor-wallet/db';
import {
  CognitoLinkRequiresVerifiedEmailError,
  findOrCreateUserByCognitoSub,
  parseRoles,
  isValidEmail,
  isValidName,
  isValidPhone,
  updateUserProfile,
} from '@vetor-wallet/auth-core';
import {
  cognitoChangePassword,
  cognitoConfirmSignUp,
  cognitoGetUser,
  cognitoInitiateAuth,
  cognitoRefreshSession,
  cognitoResendConfirmationCode,
  cognitoSignUp,
  type CognitoSession,
} from '@vetor-wallet/cognito-core';
import type { User } from '@vetor-wallet/shared';
import { cognitoErrorResponse, isCognitoApiError } from './cognitoErrorResponse';

/**
 * Rotas de autenticação (T-106: identidade no AWS Cognito).
 *
 * ## O que mudou e o que NÃO mudou
 *
 * Mudou: quem valida senha é o Cognito (`InitiateAuth` com `USER_PASSWORD_AUTH`)
 * e quem cria conta é o Cognito (`SignUp`). O `users.password_hash` **não
 * participa mais do login** — a coluna continua no banco, sem uso (dropá-la é
 * migração destrutiva, tarefa própria).
 *
 * NÃO mudou: **a tela de login é nossa** e a sessão continua sendo o cookie
 * `sid` do `express-session` (decisão do humano, 2026-08-18). Nada de Hosted UI,
 * redirect OAuth ou JWT no browser; `requireAuth` segue lendo
 * `req.session.userId`, e todas as outras rotas do app seguem intocadas.
 *
 * ## Os tokens do Cognito ficam na sessão do SERVIDOR
 *
 * `cognitoAccessToken`/`cognitoRefreshToken` vão para `req.session`, que é
 * persistida no SQLite (`SqliteSessionStore`) — o cookie carrega só o `sid`.
 * Eles existem por um motivo concreto: `ChangePassword` exige o access token do
 * usuário (ver `cognito-core/src/cognitoChangePassword.ts` para o porquê de não
 * ser `AdminSetUserPassword`).
 *
 * ## Esta rota é o único lugar onde `auth-core` e `cognito-core` se cruzam
 *
 * `cognito-core` nunca toca o banco; `auth-core` nunca fala HTTP. Quem junta os
 * dois — token do Cognito → `sub` → linha em `users` → `req.session.userId` — é
 * este arquivo (regra 4 de `docs/PACKAGES.md`).
 */

const router = Router();

function publicUser(user: User): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    created_at: user.created_at,
    roles: user.roles,
  };
}

/**
 * Traduz a falha do Cognito em resposta HTTP. **Relança o que não é dele**: um
 * `TypeError` nosso virando "E-mail ou senha invalidos" seria um bug invisível.
 *
 * Trata também a recusa do vínculo por e-mail não verificado — que vem do
 * `auth-core`, não do Cognito, e é a única resposta 403 desta rota fora do
 * cadastro não confirmado. **403 e não 401**: a credencial estava correta; o que
 * falta é prova de posse do e-mail. Mandar 401 faria o `web` derrubar a sessão
 * (evento `auth:unauthorized`) e esconderia a causa.
 */
function respondCognitoError(res: Response, err: unknown): void {
  if (err instanceof CognitoLinkRequiresVerifiedEmailError) {
    // A mensagem NÃO confirma que existe conta com aquele e-mail (não diz
    // "vinculo"): quem verificou o e-mail entra, quem não verificou recebe a
    // mesma instrução que receberia num cadastro pendente.
    console.error('[auth] vinculo por e-mail recusado: e-mail nao verificado no Cognito');
    res.status(403).json({
      error: 'Confirme o seu e-mail no provedor de identidade antes de entrar',
      code: 'EMAIL_NOT_VERIFIED',
    });
    return;
  }
  if (!isCognitoApiError(err)) throw err;
  const { status, error, code } = cognitoErrorResponse(err.code);
  // A `message` original (nossa, sem texto da AWS) fica no log do servidor: é o
  // que permite distinguir 'unexpected' de 'network' numa investigação.
  console.error('[auth] Cognito falhou:', err.code, err.message);
  res.status(status).json(code ? { error, code } : { error });
}

/**
 * Fecha o login: troca os tokens do Cognito pela nossa sessão.
 *
 * `GetUser` é quem afirma o `sub`, o e-mail e **se o e-mail foi verificado**
 * (este servidor não interpreta JWT), e `findOrCreateUserByCognitoSub` é a porta
 * única para o banco — inclusive o vínculo por e-mail que preserva a conta que já
 * existia.
 *
 * O `emailVerified` **vem sempre do Cognito e nunca do corpo da request**: é ele
 * que autoriza assumir uma linha de `users` que já existe. Se o vínculo for
 * recusado, o erro sobe **antes** de qualquer escrita na sessão — nenhuma sessão
 * é criada num vínculo negado.
 */
async function establishSession(
  req: Request,
  session: CognitoSession
): Promise<{ user: User; outcome: string }> {
  const { sub, email, emailVerified } = await cognitoGetUser(session.accessToken);
  const { user, outcome } = await findOrCreateUserByCognitoSub({
    cognitoSub: sub,
    email,
    emailVerified,
  });

  req.session.userId = user.id;
  req.session.cognitoAccessToken = session.accessToken;
  if (session.refreshToken) req.session.cognitoRefreshToken = session.refreshToken;
  req.session.cognitoUsername = email;

  return { user, outcome };
}

/**
 * `POST /api/auth/register`
 *
 * Dois desfechos, porque o pool pode estar dos dois jeitos e **a decisão de
 * produto está aberta** (T-106):
 *
 * - **201** `{ pendingConfirmation: false, ...user }` — o pool devolveu
 *   `UserConfirmed: true`, então já logamos a pessoa (é a experiência que o app
 *   sempre teve: cadastrar entra).
 * - **202** `{ pendingConfirmation: true, email }` — o pool mandou código por
 *   e-mail. **Nenhuma sessão é criada e nenhuma linha nasce em `users`**: o
 *   espelho local só existe depois de um login de verdade. Quem consome decide
 *   se mostra tela de código (`POST /confirm`) ou instrui a checar o e-mail.
 *
 * Note o que NÃO existe mais aqui: a checagem `userExists` no banco. Uma conta
 * local sem `cognito_sub` (todas as anteriores à T-106) **precisa** poder passar
 * por este registro — é assim que ela ganha identidade no pool, e o vínculo por
 * e-mail no primeiro login preserva os dados. Recusar com 409 trancaria o dono
 * do app fora da própria carteira.
 *
 * É justamente essa abertura que faz o **auto-login** abaixo depender do gate de
 * `email_verified`: sem ele, cadastrar com o e-mail de outra pessoa num pool que
 * auto-confirma devolveria a sessão **da conta dela**. O gate mora dentro do
 * `establishSession` (via `findOrCreateUserByCognitoSub`), então vale para este
 * caminho e para o `/login` de uma vez — e não há como registrar uma rota nova de
 * autenticação e esquecê-lo.
 */
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
    // Continua validado aqui, antes da chamada externa: é resposta imediata e
    // não depende da política do pool (que pode ser mais exigente e responde
    // `weakPassword`).
    if (!password || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
      return;
    }

    try {
      const signUp = await cognitoSignUp({ email, password });

      if (!signUp.userConfirmed) {
        res.status(202).json({
          pendingConfirmation: true,
          email: email.toLowerCase().trim(),
        });
        return;
      }

      const session = await cognitoInitiateAuth({ email, password });
      const { user } = await establishSession(req, session);
      res.status(201).json({ pendingConfirmation: false, ...publicUser(user) });
    } catch (err) {
      respondCognitoError(res, err);
    }
  })
);

/**
 * `POST /api/auth/confirm` — confirma o cadastro com o código do e-mail.
 *
 * Existe para o pool que mantém verificação de e-mail. **Não cria sessão**: a
 * confirmação não prova posse da senha (o código chegou por e-mail), então o
 * passo seguinte é o login normal. 204 e pronto.
 */
router.post(
  '/confirm',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, code } = req.body as { email?: string; code?: string };

    if (!email || typeof email !== 'string' || !isValidEmail(email.trim())) {
      res.status(400).json({ error: 'E-mail invalido' });
      return;
    }
    if (!code || typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: 'Codigo de confirmacao obrigatorio' });
      return;
    }

    try {
      await cognitoConfirmSignUp({ email, code });
      res.status(204).send();
    } catch (err) {
      respondCognitoError(res, err);
    }
  })
);

/**
 * `POST /api/auth/resend-code` — reenvia o código de confirmação.
 *
 * Par do `/confirm`: o código do Cognito vence e e-mail se perde. Sem isso, um
 * cadastro com código expirado ficaria sem saída — não temos credencial IAM
 * para operações `Admin*`.
 */
router.post(
  '/resend-code',
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string' || !isValidEmail(email.trim())) {
      res.status(400).json({ error: 'E-mail invalido' });
      return;
    }

    try {
      await cognitoResendConfirmationCode(email);
      res.status(204).send();
    } catch (err) {
      respondCognitoError(res, err);
    }
  })
);

/**
 * `POST /api/auth/login`
 *
 * Senha vai ao Cognito; o que volta é sessão nossa. O espelho em `users` é
 * criado ou vinculado aqui (primeiro login de um `sub` desconhecido).
 */
router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'E-mail e senha obrigatorios' });
      return;
    }

    try {
      const session = await cognitoInitiateAuth({ email, password });
      const { user } = await establishSession(req, session);
      res.json(publicUser(user));
    } catch (err) {
      respondCognitoError(res, err);
    }
  })
);

/**
 * `POST /api/auth/logout` — destrói a NOSSA sessão.
 *
 * Não chama `GlobalSignOut`/`RevokeToken` no Cognito de propósito: os tokens só
 * existiam dentro desta sessão, que acaba de ser apagada do SQLite, e revogar
 * globalmente derrubaria também outros dispositivos do mesmo usuário — que é
 * outra feature ("sair de todos os aparelhos"), não esta.
 */
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
  })
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

    // `name`/`phone` são NOSSOS (o Cognito nem sabe deles): o perfil continua
    // sendo do `auth-core`, sem ida à AWS.
    const user = await updateUserProfile(req.session.userId, update);
    if (!user) {
      req.session.destroy(() => null);
      res.status(401).json({ error: 'Sessao invalida' });
      return;
    }

    res.json(publicUser(user));
  })
);

/**
 * `POST /api/auth/change-password` (T-094, reimplementado sobre o Cognito na T-106)
 *
 * A invariante da T-094 continua de pé: **exige sessão e NÃO invalida a
 * sessão**. O que mudou é quem valida a senha atual — agora o `ChangePassword`
 * do Cognito, contra o access token do usuário.
 *
 * ## O `retry` com refresh não é otimização
 *
 * O access token do Cognito vive ~1h; nossa sessão vive 7 dias. Sem renovar,
 * qualquer troca de senha feita mais de uma hora depois do login falharia — e o
 * `NotAuthorizedException` do Cognito é **o mesmo** para "senha atual errada" e
 * "token expirado". Então: tenta; se der `invalidCredentials` e houver refresh
 * token, renova e tenta **uma** vez; se ainda der, a leitura correta é "senha
 * atual errada" (400).
 *
 * Se o próprio refresh falhar, o vínculo com o Cognito acabou (refresh revogado
 * ou vencido) — aí é 401 pedindo login novo, e não 400 acusando a senha do
 * usuário de errada.
 */
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

    const accessToken = req.session.cognitoAccessToken;
    if (!accessToken) {
      // Sessão criada antes da T-106 (ou sem token por qualquer motivo): não há
      // como falar com o Cognito em nome dela.
      res.status(401).json({
        error: 'Entre novamente para trocar a senha',
        code: 'COGNITO_SESSION_REQUIRED',
      });
      return;
    }

    try {
      await cognitoChangePassword({ accessToken, currentPassword, newPassword });
      res.status(204).send();
      return;
    } catch (err) {
      if (!isCognitoApiError(err) || err.code !== 'invalidCredentials') {
        respondCognitoError(res, err);
        return;
      }
    }

    const refreshToken = req.session.cognitoRefreshToken;
    const username = req.session.cognitoUsername;
    if (!refreshToken || !username) {
      res.status(400).json({ error: 'Senha atual invalida' });
      return;
    }

    let renewed: CognitoSession;
    try {
      renewed = await cognitoRefreshSession({ refreshToken, username });
    } catch {
      res.status(401).json({
        error: 'Entre novamente para trocar a senha',
        code: 'COGNITO_SESSION_REQUIRED',
      });
      return;
    }

    req.session.cognitoAccessToken = renewed.accessToken;
    if (renewed.refreshToken) req.session.cognitoRefreshToken = renewed.refreshToken;

    try {
      await cognitoChangePassword({
        accessToken: renewed.accessToken,
        currentPassword,
        newPassword,
      });
      // Nada de `req.session.destroy()` aqui: a sessão sobrevive à troca (T-094),
      // e o Cognito também não revoga os tokens em `ChangePassword`.
      res.status(204).send();
    } catch (err) {
      if (isCognitoApiError(err) && err.code === 'invalidCredentials') {
        res.status(400).json({ error: 'Senha atual invalida' });
        return;
      }
      respondCognitoError(res, err);
    }
  })
);

export default router;
