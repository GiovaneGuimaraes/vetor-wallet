import { types } from 'pg';

/**
 * Faz o `pg` devolver **texto** onde o app hoje espera texto.
 *
 * Sem isto, a migração mudaria o JSON da API sem ninguém pedir:
 *
 * - `NUMERIC` (todo dinheiro) já volta como string por padrão, para não perder
 *   precisão em `Number` — e é isso que queremos; quem converte é o core, que
 *   já soma em centavos inteiros;
 * - `DATE` voltaria como `Date` do JS, e `JSON.stringify` o transformaria em
 *   `2026-09-20T00:00:00.000Z`. O app inteiro — rotas, testes, telas e o
 *   `substr(date,1,7)` que ainda existe — fala `YYYY-MM-DD`;
 * - `TIMESTAMP`/`TIMESTAMPTZ` viraria `Date`, e `created_at` é devolvido como
 *   string hoje.
 *
 * Preservar o formato é o que permite que os **440 testes de rota continuem
 * valendo** durante a troca de banco. Mudar o contrato da API é uma decisão
 * própria, para depois — não um efeito colateral da migração.
 */
export function pinPgTypeParsers(): void {
  const DATE = 1082;
  const TIMESTAMP = 1114;
  const TIMESTAMPTZ = 1184;

  for (const oid of [DATE, TIMESTAMP, TIMESTAMPTZ]) {
    types.setTypeParser(oid, (value: string) => value);
  }
}
