/**
 * Valor gravado em `password_hash` quando o espelho nasce pelo Cognito.
 *
 * A coluna é `NOT NULL` e **não foi dropada** na T-106 (migração destrutiva é
 * tarefa própria, com confirmação do humano) — então precisa de algum valor. O
 * sentinela é escolhido para ser **impossível de casar**: não é um hash bcrypt
 * válido, logo `verifyPassword` devolve `false` para qualquer senha. Se algum
 * caminho de código antigo tentar autenticar contra o banco, ele falha fechado
 * em vez de aceitar qualquer coisa.
 */
export const COGNITO_MANAGED_PASSWORD_HASH = 'cognito-managed:no-local-password';
