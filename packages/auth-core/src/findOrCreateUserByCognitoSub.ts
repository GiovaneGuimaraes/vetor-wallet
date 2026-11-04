import type { Query } from '@vetor-wallet/query';
import type { User } from '@vetor-wallet/shared';
import { CognitoLinkRequiresVerifiedEmailError } from './CognitoLinkRequiresVerifiedEmailError';
import { createCognitoUser } from './createCognitoUser';
import { findUserByCognitoSub } from './findUserByCognitoSub';
import { linkCognitoSub } from './linkCognitoSub';
import { SELECT_COGNITO_USER } from './SELECT_COGNITO_USER';
import { toUser, type UserRow } from './toUser';

export type CognitoMirrorOutcome = 'found-by-sub' | 'linked-by-email' | 'created';

export interface CognitoMirrorResult {
  user: User;
  /** Qual dos três caminhos aconteceu — o chamador loga/testa, não decide nada com isso. */
  outcome: CognitoMirrorOutcome;
}

export interface FindOrCreateUserByCognitoSubParams {
  query: Query;
  cognitoSub: string;
  email: string;
  /**
   * O provedor confirmou a posse deste e-mail? Obrigatório de propósito: um
   * default (`= true`, ou o campo opcional) reabriria o buraco em silêncio no
   * próximo chamador que esquecesse de passá-lo.
   */
  emailVerified: boolean;
}

/**
 * A porta ÚNICA do login pelo Cognito para o nosso banco (T-106).
 *
 * Três caminhos, nesta ordem — e a ordem é a regra, não detalhe:
 *
 * 1. **`cognito_sub` conhecido** → é este usuário. O `sub` nunca muda, nem se o
 *    e-mail mudar no pool; por isso ele vem primeiro.
 * 2. **`sub` novo, e-mail já existe** → é a conta que já estava no app: grava o
 *    `sub` nela. **É o passo que preserva os dados do dono do app** (decisão do
 *    humano, 2026-08-18: "a conta que já existe é vinculada por e-mail"). O
 *    casamento usa o e-mail **normalizado** nos dois lados — sem isso,
 *    `Giovane@X.com` no pool criaria uma conta vazia paralela à
 *    `giovane@x.com` do banco, e a carteira, as despesas e o histórico
 *    "desapareceriam" sem nada ter sido apagado.
 *    **Este caminho exige `emailVerified: true`** — ver a invariante abaixo.
 * 3. **`sub` novo, e-mail novo** → cadastro novo: cria o espelho. **Não** exige
 *    e-mail verificado: aqui não há nada de ninguém para assumir; a conta nasce
 *    vazia e pertence a quem acabou de se cadastrar.
 *
 * ## INVARIANTE: vínculo por e-mail exige e-mail verificado no provedor
 *
 * Assumir uma linha de `users` que já existe é uma decisão de **autorização**, e
 * o e-mail só serve como chave dela quando o provedor provou a posse da caixa
 * (`email_verified`). Sem isso, qualquer um que saiba o e-mail da vítima se
 * cadastra com aquele e-mail e recebe a conta dela — ver
 * `CognitoLinkRequiresVerifiedEmailError` para o passo a passo do ataque. A regra
 * vale para **qualquer** provedor de identidade que venha depois do Cognito: não
 * é detalhe da AWS, é o que separa "mesmo e-mail" de "mesma pessoa".
 *
 * Note que `emailVerified` **não** é `UserConfirmed`: um pool pode auto-confirmar
 * o cadastro (login liberado) sem nunca verificar o e-mail. Depender da
 * configuração do pool seria terceirizar a nossa autorização para uma checkbox no
 * console da AWS.
 *
 * Corrida entre dois logins simultâneos do mesmo `sub` novo: o índice único
 * parcial `idx_users_cognito_sub` faz o segundo INSERT falhar em vez de criar
 * duas contas. O desfecho é um erro 5xx num login que o usuário repete, não
 * dado duplicado — o lado certo para errar.
 */
export async function findOrCreateUserByCognitoSub(
  params: FindOrCreateUserByCognitoSubParams
): Promise<CognitoMirrorResult> {
  const { query } = params;
  const cognitoSub = params.cognitoSub.trim();
  const email = params.email.toLowerCase().trim();

  const bySub = await findUserByCognitoSub({ query, cognitoSub });
  if (bySub) return { user: bySub, outcome: 'found-by-sub' };

  const byEmail = await query<UserRow>({
    text: `${SELECT_COGNITO_USER}email = $1`,
    values: [email],
  });
  if (byEmail.rows.length > 0) {
    // Checado ANTES de qualquer escrita: um vínculo recusado não deixa rastro
    // nenhum — nem `cognito_sub` na vítima, nem conta nova para o atacante.
    if (!params.emailVerified) throw new CognitoLinkRequiresVerifiedEmailError(email);

    const user = toUser(byEmail.rows[0]);
    await linkCognitoSub({ query, userId: user.id, cognitoSub });
    return { user, outcome: 'linked-by-email' };
  }

  return { user: await createCognitoUser({ query, email, cognitoSub }), outcome: 'created' };
}
