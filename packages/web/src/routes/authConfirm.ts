import { AuthApiError } from '../api';

/**
 * Regras da etapa "confirmar cadastro" (T-106, opção A do pool: verificação de
 * e-mail ligada).
 *
 * Funções puras, com teste ao lado, pelo mesmo motivo de `authRegister`: são
 * decisões de fluxo, e decisão de fluxo escondida dentro do componente não tem
 * como ser testada sem montar a árvore inteira.
 */

/** Tamanho do código que o Cognito envia por e-mail. */
export const CONFIRMATION_CODE_LENGTH = 6;

/**
 * Só dígitos, no máximo `CONFIRMATION_CODE_LENGTH`.
 *
 * O código chega por e-mail e volta por **colar**, quase sempre com espaço em
 * volta — e o Cognito recusa `" 123456"` com `CodeMismatchException`, que a
 * tela mostraria como "código inválido" para um código correto. Limpar aqui
 * troca esse erro por nada.
 */
export function normalizeConfirmationCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CONFIRMATION_CODE_LENGTH);
}

/**
 * Por que o botão de confirmar está travado — ou `null` se está liberado.
 *
 * Devolve o motivo em vez de um booleano: é o mesmo padrão do
 * `importDisabledReason` (Pluggy), e um botão desabilitado sem explicação é o
 * tipo de tela em que a pessoa fica clicando sem entender.
 */
export function confirmDisabledReason(params: { code: string; loading: boolean }): string | null {
  if (params.loading) return 'Confirmando...';
  if (params.code.length < CONFIRMATION_CODE_LENGTH) {
    return `Digite os ${CONFIRMATION_CODE_LENGTH} dígitos do código`;
  }
  return null;
}

export type AuthErrorOutcome = {
  /** `true` quando a saída é a tela de código, não uma mensagem de erro. */
  needsConfirmation: boolean;
  message: string;
};

/**
 * O que fazer com a falha de um login ou de um cadastro.
 *
 * `USER_NOT_CONFIRMED` (403) não é erro de credencial: é um cadastro que parou
 * no meio. Quem tenta entrar e recebe "confirme o código" precisa de um lugar
 * para digitá-lo — sem isso a conta fica presa, porque o app não tem credencial
 * IAM para as operações `Admin*` do Cognito. Daí o desvio para a etapa de
 * confirmação em vez de uma mensagem vermelha.
 */
export function interpretAuthError(err: unknown): AuthErrorOutcome {
  if (err instanceof AuthApiError && err.code === 'USER_NOT_CONFIRMED') {
    return {
      needsConfirmation: true,
      message: 'Seu cadastro ainda não foi confirmado. Digite o código enviado para o seu e-mail.',
    };
  }
  return {
    needsConfirmation: false,
    message: err instanceof Error ? err.message : 'Erro desconhecido',
  };
}
