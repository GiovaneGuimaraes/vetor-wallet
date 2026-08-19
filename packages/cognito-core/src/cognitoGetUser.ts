import { cognitoIdpCall } from './cognitoIdpCall';
import { CognitoApiError } from './CognitoApiError';

export interface CognitoUser {
  /** `sub` do pool: a chave estável da identidade (nunca muda, nem se o e-mail mudar). */
  sub: string;
  /** E-mail normalizado, como está no atributo `email` do pool. */
  email: string;
  /**
   * `email_verified` do pool — **prova de posse do e-mail**, não enfeite.
   *
   * É o que autoriza o vínculo com uma linha de `users` que já existe (ver
   * `auth-core/src/cognitoMirror.ts`). Sem ele, qualquer pessoa que saiba o
   * e-mail da vítima se cadastraria com aquele e-mail e assumiria a conta.
   *
   * **Fail closed**: atributo ausente, valor estranho ou tipo inesperado contam
   * como `false`. O Cognito manda `"true"`/`"false"` como STRING (todo atributo
   * de usuário é string), e um pool pode simplesmente não devolver o atributo —
   * tratar essa lacuna como verificado seria transformar configuração do pool em
   * autorização nossa.
   *
   * Note que **não é o mesmo que `UserConfirmed`** do `SignUp`: um pool pode
   * auto-confirmar o cadastro (login liberado) sem nunca verificar o e-mail. Foi
   * exatamente essa combinação que abriu o caminho de takeover corrigido aqui.
   */
  emailVerified: boolean;
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
 * afirma quem é o usuário — e se o e-mail dele foi verificado — é o Cognito, na
 * resposta. Este package, por decisão, **não interpreta JWT nenhum**.
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

  // Só o literal "true" (em qualquer caixa) verifica. Ausente, "false", "1" ou
  // qualquer outra coisa = não verificado.
  const emailVerified = read('email_verified').toLowerCase() === 'true';

  return { sub, email, emailVerified };
}
