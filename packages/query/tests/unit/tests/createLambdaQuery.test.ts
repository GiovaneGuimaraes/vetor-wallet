import { createLambdaQuery } from 'src/createLambdaQuery';

function invokerQueDevolve(payload: unknown) {
  const chamadas: Array<{ functionName: string; payload: string }> = [];
  return {
    chamadas,
    invoker: {
      invoke: async (functionName: string, p: string) => {
        chamadas.push({ functionName, payload: p });
        return JSON.stringify(payload);
      },
    },
  };
}

describe('createLambdaQuery', () => {
  it('manda o { text, values } como payload e devolve as linhas', async () => {
    const { invoker, chamadas } = invokerQueDevolve({ rows: [{ id: 1 }], rowCount: 1 });
    const query = createLambdaQuery({ invoker, functionName: 'fn' });

    const result = await query({ text: 'SELECT 1 WHERE id = $1', values: [7] });

    expect(result).toEqual({ rows: [{ id: 1 }], rowCount: 1 });
    expect(chamadas[0].functionName).toBe('fn');
    expect(JSON.parse(chamadas[0].payload)).toEqual({
      text: 'SELECT 1 WHERE id = $1',
      values: [7],
    });
  });

  it('aceita SQL cru como string', async () => {
    const { invoker, chamadas } = invokerQueDevolve({ rows: [], rowCount: 0 });
    await createLambdaQuery({ invoker, functionName: 'fn' })('SELECT 1');
    expect(JSON.parse(chamadas[0].payload)).toEqual({ text: 'SELECT 1' });
  });

  it('NÃO converte as chaves para camelCase (o casing da API não muda aqui)', async () => {
    const { invoker } = invokerQueDevolve({ rows: [{ user_id: 3, created_at: 'x' }], rowCount: 1 });
    const result = await createLambdaQuery({ invoker, functionName: 'fn' })('SELECT 1');
    expect(result.rows[0]).toEqual({ user_id: 3, created_at: 'x' });
  });

  it('transforma erro do Lambda em exceção, preservando o SQLSTATE', async () => {
    const { invoker } = invokerQueDevolve({
      errorType: 'Error',
      errorMessage: 'duplicate key value violates unique constraint (SQLSTATE 23505)',
    });

    await expect(
      createLambdaQuery({ invoker, functionName: 'fn' })('INSERT')
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('erro sem SQLSTATE vira exceção sem código, não silêncio', async () => {
    const { invoker } = invokerQueDevolve({ errorType: 'Error', errorMessage: 'timeout' });
    await expect(createLambdaQuery({ invoker, functionName: 'fn' })('SELECT 1')).rejects.toThrow(
      'timeout'
    );
  });

  it('recusa quando não sabe qual função invocar, em vez de chamar às cegas', async () => {
    const { invoker } = invokerQueDevolve({ rows: [], rowCount: 0 });
    delete process.env.LAMBDA_POSTGRES_QUERY_FUNCTION;
    await expect(createLambdaQuery({ invoker })('SELECT 1')).rejects.toThrow(
      'LAMBDA_POSTGRES_QUERY_FUNCTION ausente'
    );
  });

  it('usa a função do ambiente quando não recebe uma explícita', async () => {
    const { invoker, chamadas } = invokerQueDevolve({ rows: [], rowCount: 0 });
    process.env.LAMBDA_POSTGRES_QUERY_FUNCTION = 'do-env';
    await createLambdaQuery({ invoker })('SELECT 1');
    expect(chamadas[0].functionName).toBe('do-env');
    delete process.env.LAMBDA_POSTGRES_QUERY_FUNCTION;
  });

  it('rowCount ausente cai no tamanho de rows', async () => {
    const { invoker } = invokerQueDevolve({ rows: [{ id: 1 }, { id: 2 }] });
    const result = await createLambdaQuery({ invoker, functionName: 'fn' })('SELECT 1');
    expect(result.rowCount).toBe(2);
  });
});
