import { Pool, type PoolConfig } from 'pg';
import { pinPgTypeParsers } from './pgTypeParsers';
import type { Query, QueryConfig, QueryResult } from './types';

/**
 * `query` que fala direto com o Postgres, por um pool de conexões.
 *
 * **É o backend da fase 1**, e é o que torna o passo 5 possível sem AWS
 * nenhuma: o app roda na máquina, contra o container do `postgresdb`, com o
 * mesmo dialeto da Aurora. O backend por Lambda (`createLambdaQuery`) entra
 * depois, na fase 3, sem que nenhum core mude.
 *
 * O pool existe porque abrir conexão por request é caro; o Lambda de query da
 * referência abre e fecha um `Client` por invocação justamente porque lá a
 * duração do processo é outra.
 */
export function createPgQuery(config: PoolConfig = {}): Query & { end: () => Promise<void> } {
  pinPgTypeParsers();

  const pool = new Pool({
    connectionString: config.connectionString ?? process.env.POSTGRES_URL,
    ...config,
  });

  const query = (async <Row>(input: QueryConfig | string): Promise<QueryResult<Row>> => {
    const { text, values } = typeof input === 'string' ? { text: input, values: [] } : input;
    const result = await pool.query(text, values as unknown[]);
    return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
  }) as Query;

  return Object.assign(query, { end: () => pool.end() });
}
