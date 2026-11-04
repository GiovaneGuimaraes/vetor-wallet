import type { Query } from '@vetor-wallet/query';

export interface LinkCognitoSubParams {
  query: Query;
  userId: number;
  cognitoSub: string;
}

/**
 * Grava o `sub` num usuário que já existe — é o que preserva os dados de quem
 * usava o app antes do Cognito.
 *
 * Sobrescreve um `sub` diferente de propósito. Como o Cognito garante e-mail
 * único no pool, "mesmo e-mail com outro `sub`" só acontece quando a conta foi
 * apagada e recriada lá — a mesma pessoa, com identidade nova. Recusar
 * deixaria o dono trancado fora dos próprios dados sem caminho de volta pela UI.
 */
export async function linkCognitoSub(params: LinkCognitoSubParams): Promise<void> {
  const { query, userId, cognitoSub } = params;
  await query({
    text: 'UPDATE users SET cognito_sub = $1 WHERE id = $2',
    values: [cognitoSub.trim(), userId],
  });
}
