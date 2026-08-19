import { CognitoApiError, type CognitoErrorCode } from '@vetor-wallet/cognito-core';

export interface CognitoErrorResponse {
  status: number;
  /** Texto para o usuário, em português, escrito por nós. */
  error: string;
  /** Código estável para o front decidir fluxo (só onde há fluxo a decidir). */
  code?: string;
}

/**
 * Erro tipado do Cognito → status HTTP + mensagem nossa (T-106).
 *
 * A rota é o único lugar onde erro de domínio vira HTTP (regra 1 de
 * `docs/PACKAGES.md`), e este arquivo existe separado do router porque é uma
 * tabela pura — dá para testar caso a caso sem subir Express.
 *
 * Três decisões que não são óbvias no diff:
 *
 * - **`userNotFound` responde a MESMA coisa que `invalidCredentials`** (401,
 *   "E-mail ou senha invalidos"). Distinguir os dois entrega ao mundo um oráculo
 *   de "este e-mail tem conta aqui". Era o cuidado que o login por bcrypt já
 *   tinha (comparação com hash-dummy para não vazar existência por tempo) e ele
 *   não se perde ao trocar de provedor.
 * - **`invalidParameter` e `challengeRequired` são 5xx, não 4xx.** Os dois
 *   significam "o pool está configurado de um jeito que este código não atende"
 *   (`USER_PASSWORD_AUTH` desabilitado, MFA exigido) — culpa nossa/da
 *   infraestrutura, não do que o usuário digitou. Devolver 400 mandaria a pessoa
 *   revisar a senha para sempre.
 * - **`configMissing` é 503.** Fail closed com resposta clara: sem as variáveis
 *   do Cognito a autenticação está *indisponível*, não "credencial inválida".
 */
export function cognitoErrorResponse(code: CognitoErrorCode): CognitoErrorResponse {
  switch (code) {
    case 'configMissing':
      return {
        status: 503,
        error: 'Autenticacao indisponivel: Cognito nao configurado no servidor',
        code: 'AUTH_UNAVAILABLE',
      };
    case 'network':
      return {
        status: 502,
        error: 'Nao foi possivel falar com o servico de autenticacao',
        code: 'AUTH_PROVIDER_UNAVAILABLE',
      };
    case 'invalidCredentials':
    case 'userNotFound':
      return { status: 401, error: 'E-mail ou senha invalidos' };
    case 'userNotConfirmed':
      return {
        status: 403,
        error: 'Cadastro ainda nao confirmado: confirme o codigo enviado por e-mail',
        code: 'USER_NOT_CONFIRMED',
      };
    case 'emailAlreadyExists':
      return { status: 409, error: 'E-mail ja cadastrado' };
    case 'weakPassword':
      return { status: 400, error: 'Senha nao atende a politica de seguranca do cadastro' };
    case 'invalidCode':
      return { status: 400, error: 'Codigo de confirmacao invalido', code: 'INVALID_CODE' };
    case 'expiredCode':
      return {
        status: 400,
        error: 'Codigo de confirmacao expirado: peca um novo',
        code: 'EXPIRED_CODE',
      };
    case 'codeDeliveryFailure':
      return { status: 502, error: 'Nao foi possivel enviar o codigo de confirmacao' };
    case 'tooManyRequests':
      return { status: 429, error: 'Muitas tentativas: aguarde alguns instantes' };
    case 'challengeRequired':
      return { status: 501, error: 'Este login exige um passo que o app ainda nao suporta' };
    case 'invalidParameter':
    case 'unexpectedResponse':
    case 'unexpected':
      return { status: 502, error: 'Falha no servico de autenticacao' };
  }
}

/** `true` quando o erro veio do Cognito — usado para não engolir bug nosso como erro de auth. */
export function isCognitoApiError(err: unknown): err is CognitoApiError {
  return err instanceof CognitoApiError;
}
