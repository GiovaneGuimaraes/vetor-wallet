import type { Query, QueryConfig, QueryResult } from './types';

/** O mínimo do client de Lambda de que precisamos — injetável no teste. */
export interface LambdaInvoker {
  invoke(functionName: string, payload: string): Promise<string>;
}

export interface CreateLambdaQueryOptions {
  invoker: LambdaInvoker;
  functionName?: string;
}

interface LambdaError {
  errorType: string;
  errorMessage: string;
}

/**
 * `query` que invoca o Lambda de acesso ao banco — o mesmo desenho do
 * `@ttoss/lambda-postgres-query`: o Lambda vive na VPC e é **a única coisa que
 * abre conexão com o Postgres**; quem chama fica fora dela.
 *
 * O `invoker` é injetado em vez de o package importar `@aws-sdk/client-lambda`
 * direto, por três motivos: o teste não precisa de AWS, a fase 1 inteira roda
 * sem nenhuma dependência de SDK instalada, e o dia de trocar o SDK não toca
 * este arquivo.
 *
 * **Diferença em relação à referência, deliberada**: lá o `query` converte as
 * chaves para camelCase. Aqui **não** — a API do Vetor Wallet devolve
 * `user_id`, `created_at`, `external_id` hoje, e o casing inconsistente é um
 * débito com tarefa própria no `BACKLOG.md`. Trocar o casing junto com o banco
 * quebraria o web inteiro no meio da migração, e esconderia a mudança de
 * contrato dentro de um passo que promete não mudar contrato nenhum.
 */
export function createLambdaQuery(options: CreateLambdaQueryOptions): Query {
  const { invoker, functionName } = options;

  return (async <Row>(input: QueryConfig | string): Promise<QueryResult<Row>> => {
    const config = typeof input === 'string' ? { text: input } : input;
    const name = functionName ?? process.env.LAMBDA_POSTGRES_QUERY_FUNCTION;

    if (!name) {
      throw new Error(
        'LAMBDA_POSTGRES_QUERY_FUNCTION ausente: sem o nome da função não há como consultar o banco'
      );
    }

    const raw = await invoker.invoke(name, JSON.stringify(config));
    const result = JSON.parse(raw) as QueryResult<Row> | LambdaError;

    if ('errorType' in result) {
      // O erro do Lambda chega serializado; preserva a mensagem e o código,
      // porque `isUniqueViolation` depende de reconhecê-lo.
      const error = new Error(result.errorMessage);
      const code = /SQLSTATE (\w+)/.exec(result.errorMessage)?.[1];
      if (code) (error as Error & { code?: string }).code = code;
      throw error;
    }

    return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
  }) as Query;
}
