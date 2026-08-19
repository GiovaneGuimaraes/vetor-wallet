import { cognitoIdpCall } from './cognitoIdpCall';
import { CognitoApiError } from './CognitoApiError';

export interface CognitoUser {
  /** `sub` do pool: a chave estável da identidade (nunca muda, nem se o e-mail mudar). */
  sub: string;
  /** E-mail normalizado, como está no atributo `email` do pool. */
  email: string;
}

/**
 * `GetUser` — quem é o dono deste access token (T-106).
 *
 * ## Por que não decodificar o `IdToken`
 *
 * O `sub` também vem dentro do id token, e ler o payload de um JWT é de graça —
 * mas exigiria ou confiar num JWT sem verificar assinatura, ou trazer
 * verificação de JWKS (chaves do pool, cache, rotação) para dentro deste
 * package. A primeira opção cria um precedente perigoso: a função existiria e o
 * próximo uso pode ser sobre um token vindo do **cliente**, onde a assinatura é
 * a única coisa que separa identidade de palpite. A segunda é muito código para
 * um ganho de um round-trip **por login**.
 *
 * `GetUser` custa uma chamada HTTP e não tem nenhuma dessas escolhas: quem
 * afirma quem é o usuário é o Cognito, na resposta. Este package, por decisão,
 * **não interpreta JWT nenhum**.
 *
 * O e-mail é normalizado (`toLowerCase().trim()`) porque é ele que casa com
 * `users.email` no espelho do `auth-core` — que normaliza em toda leitura e
 * escrita.
 */
export async function cognitoGetUser(accessToken: string): Promise<CognitoUser> {
  const payload = await cognitoIdpCall('GetUser', { AccessToken: accessToken });

  const attributes = Array.isArray(payload.UserAttributes) ? payload.UserAttributes : [];
  const read = (name: string): string => {
    for (const attr of attributes) {
      if (
        typeof attr === 'object' &&
        attr !== null &&
        (attr as { Name?: unknown }).Name === name &&
        typeof (attr as { Value?: unknown }).Value === 'string'
      ) {
        return (attr as { Value: string }).Value.trim();
      }
    }
    return '';
  };

  const sub = read('sub');
  const email = read('email').toLowerCase();

  if (!sub || !email) {
    throw new CognitoApiError('unexpectedResponse', 'Resposta de GetUser do Cognito sem sub/email');
  }

  return { sub, email };
}
