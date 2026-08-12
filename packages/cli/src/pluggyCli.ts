// Plumbing compartilhado pelos dois jobs da Pluggy (`pluggy:link`,
// `pluggy:sync`): leitura de argv/env e mascaramento para o log. Nenhuma regra
// de negócio aqui — isso vive nos `*-core` (ver packages/cli/CLAUDE.md).

import { findUserByEmail } from '@vetor-wallet/auth-core';

/** `--chave=valor` no argv; `undefined` quando a flag não veio. */
export function flagValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length).trim() || undefined;
}

/**
 * De QUEM é a operação. Toda tabela de dados filtra por `user_id` e um job não
 * tem sessão HTTP, então o usuário é entrada explícita: `--email=` no argv ou,
 * na falta dele, `PLUGGY_USER_EMAIL` como **default do CLI** (T-089a — antes
 * era "o usuário dono de tudo"; com items por usuário ele é só a conveniência de
 * quem roda o comando à mão).
 *
 * **Sem default silencioso**: nenhuma das duas fontes → falha. Nunca escolher um
 * usuário por conta própria (ex.: "o único do banco").
 */
export async function resolvePluggyUserId(args: string[]): Promise<number> {
  const email = flagValue(args, 'email') ?? (process.env.PLUGGY_USER_EMAIL ?? '').trim();
  if (!email) {
    throw new Error(
      'Usuário não informado: passe --email=voce@exemplo.com ou defina PLUGGY_USER_EMAIL no .env do cli'
    );
  }
  const user = await findUserByEmail(email);
  if (!user) throw new Error(`Usuário não encontrado para o e-mail: ${email}`);
  return user.id;
}

/**
 * Mascara o `itemId` para saída de terminal.
 *
 * O `itemId` é **credencial portadora** (quem o tem lê o extrato daquela
 * conexão), e a saída de um job costuma ir para print, issue e PR. Mostrar os 8
 * primeiros caracteres basta para o humano distinguir dois items sem publicar a
 * chave.
 */
export function maskItemId(itemId: string): string {
  if (itemId.length <= 8) return `${itemId.slice(0, 2)}…`;
  return `${itemId.slice(0, 8)}…`;
}
