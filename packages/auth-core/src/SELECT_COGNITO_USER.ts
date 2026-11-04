/** Prefixo comum das leituras do espelho; cada chamador acrescenta o `WHERE`. */
export const SELECT_COGNITO_USER =
  'SELECT id, email, name, phone, created_at, roles, cognito_sub FROM users WHERE ';
