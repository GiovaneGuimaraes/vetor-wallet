import { appendFileSync } from 'fs';
import { sanitizeLogFields } from './sanitizeLogFields';

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Log estruturado em JSON, uma linha por evento (NDJSON) — T-122.
 *
 * Existe para o agente (e o humano) validarem "o que eu queria fazer aconteceu?"
 * pelos logs do app, além dos testes. Sem lib: `JSON.stringify` + stdout/arquivo.
 *
 * - `LOG_FILE` (opcional, lida a CADA chamada): caminho de um arquivo em modo
 *   append, fora do repo. Sem ela, stdout (stderr para `error`).
 * - Todo campo passa por `sanitizeLogFields`: chave proibida (valor, saldo,
 *   e-mail, senha, token, cookie, itemId…) é derrubada. `ts`, `level` e `event`
 *   vêm por último e não podem ser sobrescritos pelos campos.
 * - NUNCA lança: observabilidade não derruba request.
 */
export function log(level: LogLevel, event: string, input: Record<string, unknown> = {}): void {
  const { fields, redacted } = sanitizeLogFields(input);
  const line = JSON.stringify({
    ...fields,
    ...(redacted.length > 0 ? { redacted } : {}),
    ts: new Date().toISOString(),
    level,
    event,
  });

  try {
    const file = process.env.LOG_FILE;
    if (file) {
      appendFileSync(file, line + '\n');
    } else if (level === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  } catch {
    // Disco cheio/caminho inválido: o app segue, o log se perde.
  }
}
