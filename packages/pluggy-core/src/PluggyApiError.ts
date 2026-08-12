/**
 * Erro tipado do client da Pluggy (T-087).
 *
 * Integração **nunca degrada em silêncio** aqui (mesma postura do provider
 * AbacatePay): uma cotação ausente é tolerável, um extrato ausente não — se a
 * sincronização não conseguir listar as transações, o job precisa terminar com
 * código de saída não-zero em vez de anunciar "0 lançamentos importados", que
 * é indistinguível de "nada novo no banco".
 *
 * `message` é sempre escrita à mão. **Nunca** inclui corpo de request, `apiKey`
 * nem `clientSecret` — nem em erro de autenticação, onde a tentação de logar o
 * payload é maior (é justamente o payload com o segredo).
 */
export class PluggyApiError extends Error {
  /** Status HTTP quando o erro veio de uma resposta; `undefined` em rede/timeout. */
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'PluggyApiError';
    this.status = status;
  }
}
