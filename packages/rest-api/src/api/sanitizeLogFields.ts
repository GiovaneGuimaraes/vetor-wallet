/**
 * Filtro de campos do log estruturado (T-122) — a última barreira entre uma
 * rota distraída e o arquivo de log. O log existe para provar "o efeito
 * aconteceu" (contagens, ids locais, códigos de erro), NUNCA para carregar dado
 * financeiro ou credencial. Por isso o filtro é por DENYLIST de chave (nome
 * normalizado: minúsculo, sem pontuação, casamento por substring) E por tipo de
 * valor (só primitivo).
 *
 * Chave proibida é DERRUBADA (o valor nunca chega à saída) e só o NOME dela vai
 * em `redacted` — o nome ajuda a achar o `log()` malfeito, o valor não vaza.
 *
 * Substring é deliberadamente agressiva (`name` derruba `errorName`): o custo de
 * um falso positivo é renomear uma chave; o de um falso negativo é vazar dado.
 */
export const FORBIDDEN_LOG_KEY_PARTS = [
  // credenciais e identidade
  'email',
  'password',
  'senha',
  'token',
  'secret',
  'cookie',
  'authorization',
  'apikey',
  'itemid',
  'cpf',
  'phone',
  'sid',
  // dado financeiro
  'amount',
  'value',
  'valor',
  'balance',
  'saldo',
  'price',
  'preco',
  'quantity',
  'description',
  'descricao',
  'merchant',
  'establishment',
  'estabelecimento',
  'memo',
  'fitid',
  'externalid',
  'ticker',
  'name',
];

const MAX_STRING = 200;

export interface SanitizedLogFields {
  fields: Record<string, string | number | boolean | null>;
  redacted: string[];
}

export function sanitizeLogFields(input: Record<string, unknown>): SanitizedLogFields {
  const fields: SanitizedLogFields['fields'] = {};
  const redacted: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const forbidden = FORBIDDEN_LOG_KEY_PARTS.some((bad) => normalized.includes(bad));
    const primitive =
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value));

    // Objeto/array/função: não há como garantir o que carregam. `undefined`
    // some em silêncio (campo opcional ausente).
    if (forbidden || !primitive) {
      if (value !== undefined) redacted.push(key);
      continue;
    }
    fields[key] = typeof value === 'string' ? value.slice(0, MAX_STRING) : (value as never);
  }
  return { fields, redacted };
}
