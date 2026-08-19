/**
 * Timeout de cada request ao Cognito.
 *
 * 10s (entre os 5s da brapi e os 15s da Pluggy): a chamada é síncrona ao
 * clique de login do usuário — esperar 15s por um `InitiateAuth` é pior que
 * dizer "não deu, tente de novo" —, mas a API do Cognito ocasionalmente paga
 * cold start de região e 5s deixaria login falhando sem motivo real.
 */
export const COGNITO_TIMEOUT_MS = 10_000;
