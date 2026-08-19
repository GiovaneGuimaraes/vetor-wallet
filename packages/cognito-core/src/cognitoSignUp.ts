import { cognitoIdpCall } from './cognitoIdpCall';
import { CognitoApiError } from './CognitoApiError';
import { resolveCognitoConfig } from './resolveCognitoConfig';
import { secretHashFields } from './secretHashFields';

export interface CognitoSignUpResult {
  /** `sub` do usuário no pool — a identidade que espelhamos em `users.cognito_sub`. */
  userSub: string;
  /**
   * `true` = o pool já deu a conta por confirmada (verificação desligada ou
   * auto-confirm por Lambda) e o login já funciona.
   * `false` = o Cognito enviou um código e o login só passa depois do
   * `ConfirmSignUp`.
   *
   * **As duas respostas são legítimas** e quem chama tem de tratar as duas: qual
   * dos dois modos o pool do dono do app usa é decisão de produto ainda aberta
   * (T-106). Assumir uma delas deixaria o cadastro quebrado no outro caso.
   */
  userConfirmed: boolean;
}

/**
 * `SignUp` — cria o usuário no user pool (T-106).
 *
 * O e-mail é **normalizado** (`toLowerCase().trim()`) e usado como `Username` e
 * como atributo `email`. Normalizar aqui não é cosmético: é o mesmo contrato do
 * `auth-core` (e-mail normalizado em toda leitura e escrita), e é o que faz o
 * `SECRET_HASH` — calculado sobre o `Username` — bater nas chamadas seguintes.
 * Cadastrar `Joao@X.com` e logar `joao@x.com` viraria "usuário não existe" num
 * pool sem alias.
 *
 * Não cria nada no nosso banco: **este package nunca toca `db`** (regra 2 de
 * `docs/PACKAGES.md`). O espelho em `users` nasce no primeiro login
 * bem-sucedido, via `auth-core`.
 */
export async function cognitoSignUp(params: {
  email: string;
  password: string;
}): Promise<CognitoSignUpResult> {
  const config = resolveCognitoConfig();
  const username = params.email.toLowerCase().trim();

  const payload = await cognitoIdpCall('SignUp', {
    ClientId: config.clientId,
    Username: username,
    Password: params.password,
    UserAttributes: [{ Name: 'email', Value: username }],
    ...secretHashFields({ config, username, key: 'SecretHash' }),
  });

  const userSub = typeof payload.UserSub === 'string' ? payload.UserSub.trim() : '';
  const userConfirmed = payload.UserConfirmed;

  if (!userSub || typeof userConfirmed !== 'boolean') {
    throw new CognitoApiError(
      'unexpectedResponse',
      'Resposta de SignUp do Cognito sem UserSub/UserConfirmed'
    );
  }

  return { userSub, userConfirmed };
}
