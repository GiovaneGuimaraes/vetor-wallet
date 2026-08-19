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
 * **A tela de digitar o código é tarefa futura, de propósito.** Aqui o desfecho
 * pendente só vira aviso: o backend já tem `POST /api/auth/confirm` e
 * `POST /api/auth/resend-code` prontos para quando ela existir.
 */
export type RegisterOutcome =
  { kind: 'authenticated'; user: User } | { kind: 'pendingConfirmation'; message: string };

export function interpretRegisterResult(result: RegisterResult): RegisterOutcome {
  if (result.pendingConfirmation) {
    return {
      kind: 'pendingConfirmation',
      message: `Enviamos um código de confirmação para ${result.email}. Confirme o cadastro e entre com e-mail e senha.`,
    };
  }

  // `pendingConfirmation: false` só existe no formato de resposta; o resto do
  // app trabalha com `User` puro.
  const { pendingConfirmation: _ignored, ...user } = result;
  return { kind: 'authenticated', user };
}
