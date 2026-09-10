import type { RegisterResult, User } from '@vetor-wallet/shared';

/**
 * O que fazer com a resposta de `POST /api/auth/register` (T-106).
 *
 * O cadastro passou a ter dois desfechos porque o user pool do Cognito pode
 * exigir confirmação de e-mail ou não — e **qual dos dois o pool usa é decisão
 * de produto ainda aberta**. Enquanto estiver aberta, a tela precisa aguentar os
 * dois: ou entra direto, ou avisa que o código foi enviado.
 *
 * Função pura, com teste ao lado, porque a alternativa (um `if` dentro do
 * `AuthPage`) é lógica de fluxo escondida em componente — o `CLAUDE.md` da raiz
 * pede o contrário.
 *
 * O desfecho pendente carrega o **e-mail**, e não só a frase: é ele que a etapa
 * de confirmação usa como `Username` no `POST /api/auth/confirm` e no
 * `/resend-code`. Reler o campo do formulário serviria — até a pessoa editar o
 * campo antes de digitar o código e confirmar o cadastro de outro endereço.
 */
export type RegisterOutcome =
  | { kind: 'authenticated'; user: User }
  | { kind: 'pendingConfirmation'; email: string; message: string };

export function interpretRegisterResult(result: RegisterResult): RegisterOutcome {
  if (result.pendingConfirmation) {
    return {
      kind: 'pendingConfirmation',
      email: result.email,
      message: `Enviamos um código de confirmação para ${result.email}. Digite o código abaixo para concluir o cadastro.`,
    };
  }

  // `pendingConfirmation: false` só existe no formato de resposta; o resto do
  // app trabalha com `User` puro.
  const { pendingConfirmation: _ignored, ...user } = result;
  return { kind: 'authenticated', user };
}
