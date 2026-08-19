import { CognitoApiError } from './CognitoApiError';

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  /** `null` quando o app client do pool não tem secret — os dois casos são válidos. */
  clientSecret: string | null;
}

/**
 * Configuração do pool, lida do ambiente (T-106). **Fail closed.**
 *
 * As três primeiras variáveis são obrigatórias e a ausência de qualquer uma
 * lança `configMissing` — nenhuma request sai. O contrário (tentar e quebrar
 * torto) daria 500 com stack de `fetch` numa URL `cognito-idp.undefined...`,
 * que é o pior desfecho possível para quem está tentando entrar no app.
 *
 * `COGNITO_CLIENT_SECRET` é **opcional de propósito**: um app client do Cognito
 * pode ser criado com ou sem secret, e é o próprio pool que decide. Com secret,
 * toda chamada precisa levar `SECRET_HASH` (ver `computeSecretHash`); sem
 * secret, mandar `SECRET_HASH` é erro. Os dois caminhos existem e têm teste
 * porque não sabemos ainda qual é o pool do dono do app — e descobrir isso em
 * produção, na tela de login, não é opção.
 *
 * Env lido **dentro** da função, nunca no top-level do módulo (mesmo motivo do
 * `BRAPI_TOKEN` no `brapi-core`): permite trocar o env entre casos de teste.
 */
export function resolveCognitoConfig(): CognitoConfig {
  const region = (process.env.COGNITO_REGION ?? '').trim();
  const userPoolId = (process.env.COGNITO_USER_POOL_ID ?? '').trim();
  const clientId = (process.env.COGNITO_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.COGNITO_CLIENT_SECRET ?? '').trim();

  const missing = [
    region ? null : 'COGNITO_REGION',
    userPoolId ? null : 'COGNITO_USER_POOL_ID',
    clientId ? null : 'COGNITO_CLIENT_ID',
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    throw new CognitoApiError(
      'configMissing',
      `Configuracao do Cognito ausente: ${missing.join(', ')}`
    );
  }

  return { region, userPoolId, clientId, clientSecret: clientSecret || null };
}
