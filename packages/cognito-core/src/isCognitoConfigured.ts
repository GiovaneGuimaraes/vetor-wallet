import { resolveCognitoConfig } from './resolveCognitoConfig';

/**
 * "Dá para autenticar?" sem lançar (T-106).
 *
 * Existe para quem só quer o booleano — um health check ou um gate — sem
 * montar `try/catch` em torno de `resolveCognitoConfig`. Não substitui o
 * `resolveCognitoConfig` nas rotas: lá o erro tipado é justamente o que produz
 * a resposta clara de "auth indisponível", e checar antes seria duplicar a
 * leitura do env com chance de divergir.
 */
export function isCognitoConfigured(): boolean {
  try {
    resolveCognitoConfig();
    return true;
  } catch {
    return false;
  }
}
