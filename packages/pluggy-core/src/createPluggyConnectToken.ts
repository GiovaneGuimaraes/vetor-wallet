import { pluggySend } from './pluggySend';
import { PluggyApiError } from './PluggyApiError';

/**
 * `POST /connect_token` → token de curta duração para o widget (T-089b).
 *
 * ## Por que isto existe
 *
 * O widget do `cdn.pluggy.ai` roda no **navegador** e precisa de credencial
 * para falar com a Pluggy. O `clientSecret` jamais pode ir para lá: ele lê o
 * extrato de **todos** os items da aplicação, não só o do usuário da vez. O
 * `connect_token` é a resposta da Pluggy para isso — o servidor troca o segredo
 * permanente por um token efêmero e é esse token que vai para o cliente.
 *
 * Consequência para quem for mexer: **este endpoint tem de ser chamado no
 * servidor**. Uma "otimização" que o mova para o web derruba a única fronteira
 * que separa a credencial mestre do browser.
 *
 * ## `clientUserId`
 *
 * Amarra o token ao usuário do app. Não é segurança do nosso lado (a rota já
 * exige sessão) — é o que faz o painel da Pluggy mostrar de quem é cada item, e
 * o que permite, no futuro, a Pluggy recusar um token reaproveitado por outra
 * conta. Passamos o `id` numérico, **nunca o e-mail**: o token trafega pelo
 * browser e e-mail é dado pessoal que não precisa estar lá.
 *
 * ## `itemId` (opcional) — modo atualização
 *
 * Com `itemId`, o widget abre em modo **reautenticação** daquela conexão (senha
 * trocada, MFA expirado) em vez de criar uma conexão nova. Sem isso, um usuário
 * que só precisa renovar a credencial acabaria com dois items para o mesmo
 * banco — e o segundo importaria tudo de novo.
 */
export interface CreatePluggyConnectTokenParams {
  clientUserId: string;
  /** Presente = reautenticar este item; ausente = conectar uma instituição nova. */
  itemId?: string;
}

export async function createPluggyConnectToken(
  params: CreatePluggyConnectTokenParams
): Promise<string> {
  const clientUserId = params.clientUserId.trim();
  if (!clientUserId) {
    throw new PluggyApiError('clientUserId ausente ao pedir connect_token à Pluggy');
  }

  // FORMA DO CORPO: `itemId` na raiz, `clientUserId` DENTRO de `options` — é o
  // contrato medido contra a API real na T-087 e registrado em
  // `packages/pluggy-core/CLAUDE.md`. Mandar `clientUserId` na raiz não dá erro:
  // a Pluggy ignora o campo desconhecido e emite um token sem dono, que
  // funciona no widget e só some do painel. Falha silenciosa — daí o comentário.
  const itemId = params.itemId?.trim();
  const payload = await pluggySend('POST', '/connect_token', {
    ...(itemId ? { itemId } : {}),
    options: { clientUserId },
  });

  const token =
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { accessToken?: unknown }).accessToken === 'string'
      ? (payload as { accessToken: string }).accessToken.trim()
      : '';

  if (!token) {
    throw new PluggyApiError('Resposta de /connect_token da Pluggy sem accessToken');
  }
  return token;
}
