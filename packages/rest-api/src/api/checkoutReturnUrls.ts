/** Origem do web em dev — o mesmo default do CORS em `index.ts`. */
export const DEFAULT_APP_ORIGIN = 'http://localhost:5173';

/**
 * A origem do web para onde a AbacatePay devolve o usuário depois do checkout
 * (T-124c). Vem SÓ do env (`ALLOWED_ORIGIN`), nunca da request: um `Origin`/
 * `Referer`/campo do corpo aqui viraria redirect aberto — a página hospedada
 * de pagamento mandaria o usuário para onde o atacante quisesse.
 *
 * `ALLOWED_ORIGIN` deveria ser UMA origem, mas uma lista separada por vírgula
 * (ou lixo) quebraria a `completionUrl`. Usa a primeira entrada que é uma URL
 * http(s) válida, reduzida à origem (sem caminho/query/fragmento); nenhuma
 * válida → `DEFAULT_APP_ORIGIN`.
 */
export function appOrigin(raw: string | undefined = process.env.ALLOWED_ORIGIN): string {
  for (const part of (raw ?? '').split(',')) {
    const candidate = part.trim();
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      // entrada inválida: tenta a próxima
    }
  }
  return DEFAULT_APP_ORIGIN;
}

/** `completionUrl`/`returnUrl` do checkout, a partir da origem do env. */
export function checkoutReturnUrls(origin: string = appOrigin()): {
  completionUrl: string;
  returnUrl: string;
} {
  return {
    completionUrl: `${origin}/planos?checkout=completed`,
    returnUrl: `${origin}/planos?checkout=returned`,
  };
}
