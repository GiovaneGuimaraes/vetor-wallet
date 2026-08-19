import { cognitoIdpCall } from './cognitoIdpCall';

/**
 * `ChangePassword` — troca a senha do usuário logado (T-106).
 *
 * ## Por que pelo access token, e não `AdminSetUserPassword`
 *
 * Havia dois caminhos e a T-106 escolheu este:
 *
 * 1. **`ChangePassword` com o access token do usuário** (implementado). Não
 *    exige credencial IAM — a autorização é o próprio token. Exige que a sessão
 *    do servidor guarde o access token (e o refresh token, para renová-lo: o
 *    access vive 1h e nossa sessão vive 7 dias).
 * 2. **`AdminSetUserPassword`** (descartado). Operação `Admin*` = assinatura
 *    **SigV4** com credencial IAM que o app **não tem** — nem variável de
 *    ambiente, nem role. Adotá-la significaria pedir ao humano uma chave IAM com
 *    permissão de escrita no pool, guardá-la no servidor e trocar "usuário
 *    troca a própria senha" por "servidor sobrescreve a senha de quem pedir".
 *    Pior ainda: `AdminSetUserPassword` **não valida a senha atual**, então a
 *    verificação de "senha atual correta" passaria a ser nossa — reinventando
 *    exatamente o que se ganha ao delegar identidade ao Cognito.
 *
 * O `ChangePassword` **valida a senha atual** (`PreviousPassword`) do lado da
 * AWS e responde `NotAuthorizedException` quando ela está errada — o mesmo
 * `__type` de "token inválido/expirado". Essa ambiguidade é resolvida na rota,
 * que tenta renovar o token uma vez antes de concluir "senha atual errada".
 *
 * ## Invariante da T-094 preservada
 *
 * O `ChangePassword` do Cognito **não revoga** os tokens existentes (quem faz
 * isso é `GlobalSignOut`/`RevokeToken`, que não chamamos). A troca de senha
 * segue exigindo sessão e **não** invalidando a sessão — nem a nossa (o cookie
 * `sid` não é tocado), nem a do Cognito.
 */
export async function cognitoChangePassword(params: {
  accessToken: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await cognitoIdpCall('ChangePassword', {
    AccessToken: params.accessToken,
    PreviousPassword: params.currentPassword,
    ProposedPassword: params.newPassword,
  });
}
