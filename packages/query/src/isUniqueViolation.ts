/**
 * `true` quando o erro é violação de unicidade no Postgres (`SQLSTATE 23505`).
 *
 * **É a armadilha silenciosa do passo 5.** Hoje o equivalente em SQLite
 * (`isUniqueViolation` de `@vetor-wallet/db`) sustenta duas coisas que NÃO
 * falham alto quando param de funcionar:
 *
 * 1. a **dedupe de importação** (T-084) — OFX/Pluggy reimportados viram 500 em
 *    vez de 409, e o usuário vê erro onde deveria ver "já importado";
 * 2. a **corrida de materialização de recorrência** (T-035) — o perdedor da
 *    corrida deixa de ser reconhecido e a request inteira falha.
 *
 * Nenhuma das duas quebra build ou tipo. Por isso esta função é a **primeira
 * coisa a escrever no passo 5**, antes de traduzir qualquer query.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const code = (error as { code?: unknown }).code;
  if (code === '23505') return true;

  // Fallback por mensagem, para o caso de o erro chegar embrulhado (o Lambda
  // serializa o erro em JSON e o `code` pode se perder no caminho).
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('duplicate key value');
}
