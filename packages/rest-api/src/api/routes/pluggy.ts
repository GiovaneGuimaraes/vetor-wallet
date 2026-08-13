import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import { requirePluggyEnabled } from '../middleware/requirePluggyEnabled';
import { isValidIsoDate } from '@vetor-wallet/validation-core';
import {
  linkPluggyItem,
  listPluggyItems,
  unlinkPluggyItem,
  syncPluggyItems,
  wipeUserFinancialEntries,
  PluggyItemError,
  type PluggyItem,
} from '@vetor-wallet/bank-import-core';
import {
  createPluggyConnectToken,
  deletePluggyItem,
  fetchPluggyAccounts,
  fetchPluggyTransactions,
  isPluggyIntegrationEnabled,
  PluggyApiError,
} from '@vetor-wallet/pluggy-core';
import type {
  PluggyConnectTokenResponse,
  PluggyItemView,
  PluggyStatusResponse,
  PluggySyncResponse,
} from '@vetor-wallet/shared';

/**
 * `/api/pluggy/*` — a integração Open Finance dentro do app (T-089b).
 *
 * Até aqui a Pluggy só existia no terminal: a T-087 entregou o job e a T-089a
 * pôs os items no banco, mas conectar um banco exigia rodar `pluggy:link` à mão.
 * Este router é o que faz a integração acontecer no app.
 *
 * ## É aqui que dois módulos se cruzam
 *
 * Conforme `docs/PACKAGES.md`: `bank-import-core` (Core — política de
 * importação, fala com o banco) e `pluggy-core` (Integração — fala com a
 * Pluggy, **nunca** com o banco) não se importam. Quem orquestra os dois, e
 * traduz erro tipado em status HTTP, é esta rota.
 *
 * ## Gates, em ordem
 *
 * 1. `requireAuth` — toda rota de dados filtra por `user_id`.
 * 2. `requirePluggyEnabled` — o gate `ENVIRONMENT` (fail closed). **Exceto** em
 *    `GET /status`, que precisa responder justamente para dizer ao web que a
 *    integração está desligada.
 * 3. `requireActiveSubscription` — gating binário: `plans` não tem coluna de
 *    capacidade, então todo pagante inclui a integração (decisão do humano).
 *    Como ele só barra métodos de escrita, o `GET /status` passa livre de
 *    propósito: quem está sem assinatura continua vendo as próprias conexões.
 */
const router = Router();

function toView(item: PluggyItem): PluggyItemView {
  // `id` interno e `userId` NÃO vão para o cliente: numeração de linha do banco
  // não é contrato de API e vaza volume de uso.
  return {
    itemId: item.itemId,
    connectorId: item.connectorId,
    connectorName: item.connectorName,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** Janela default da sincronização: 30 dias, igual ao `pluggy:sync` do cli. */
const DEFAULT_WINDOW_DAYS = 30;

function defaultDateFrom(): string {
  return new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * `GET /api/pluggy/status` — a integração está ligada, e quais são minhas conexões.
 *
 * **Sem `requirePluggyEnabled`**, e isso é deliberado: é esta rota que informa
 * `enabled` ao web. Se ela também fosse gateada, o cliente precisaria de uma
 * cópia da flag em `VITE_*` para saber o que renderizar — exatamente a
 * duplicação que a decisão do humano proíbe (dois `.env` divergem e a cópia do
 * cliente é burlável).
 *
 * Com a integração desligada devolve `items: []` sem consultar o banco: no
 * ambiente bloqueado não há o que listar, e evita insinuar estado que o usuário
 * não pode usar.
 */
router.get(
  '/status',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;

    if (!isPluggyIntegrationEnabled()) {
      const body: PluggyStatusResponse = { enabled: false, items: [] };
      res.json(body);
      return;
    }

    const items = await listPluggyItems({ db, userId });
    const body: PluggyStatusResponse = { enabled: true, items: items.map(toView) };
    res.json(body);
  })
);

/**
 * `POST /api/pluggy/connect-token` — token efêmero para o widget do browser.
 *
 * O `clientSecret` da Pluggy **nunca** vai para o cliente: ele lê o extrato de
 * todos os items da aplicação, não só os deste usuário. Esta rota é a fronteira
 * — o servidor troca o segredo permanente por um token de curta duração, e é o
 * token que desce.
 *
 * `itemId` opcional no corpo abre o widget em modo reautenticação daquela
 * conexão (senha trocada/MFA), em vez de criar uma segunda conexão para o mesmo
 * banco. Só aceitamos um `itemId` que **já é do usuário** — aceitar um id
 * arbitrário deixaria qualquer um pedir token de reautenticação para o item de
 * outra pessoa.
 */
router.post(
  '/connect-token',
  requireAuth,
  requirePluggyEnabled,
  requireActiveSubscription,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const rawItemId = typeof req.body?.itemId === 'string' ? req.body.itemId.trim() : '';

    if (rawItemId) {
      const items = await listPluggyItems({ db, userId });
      if (!items.some((item) => item.itemId === rawItemId)) {
        // 404, não 403: item de outro usuário é invisível (doutrina da T-089a).
        res.status(404).json({ error: 'Conexão não encontrada' });
        return;
      }
    }

    const accessToken = await createPluggyConnectToken({
      clientUserId: String(userId),
      ...(rawItemId ? { itemId: rawItemId } : {}),
    });

    const body: PluggyConnectTokenResponse = { accessToken };
    res.json(body);
  })
);

/**
 * `POST /api/pluggy/items` — registra a conexão que o widget acabou de criar.
 *
 * O widget devolve o `itemId` no callback de sucesso, no browser; é o cliente
 * que o traz para cá. A idempotência é a da T-089a (um `INSERT … ON CONFLICT`,
 * sem SELECT-antes-do-INSERT): reconectar o mesmo banco atualiza a linha.
 */
router.post(
  '/items',
  requireAuth,
  requirePluggyEnabled,
  requireActiveSubscription,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { itemId, connectorId, connectorName, status } = req.body ?? {};

    try {
      const item = await linkPluggyItem({
        db,
        userId,
        itemId: typeof itemId === 'string' ? itemId : '',
        connectorId: typeof connectorId === 'number' ? connectorId : null,
        connectorName: typeof connectorName === 'string' ? connectorName : null,
        status: typeof status === 'string' ? status : null,
      });
      res.status(201).json(toView(item));
    } catch (err) {
      if (err instanceof PluggyItemError) {
        // `ITEM_ALREADY_LINKED` é 409 e a mensagem do core NÃO diz de quem é o
        // item — devolvê-la intacta é o que preserva essa invariante.
        res.status(err.code === 'INVALID_ITEM_ID' ? 400 : 409).json({
          error: err.message,
          code: err.code,
        });
        return;
      }
      throw err;
    }
  })
);

/**
 * `DELETE /api/pluggy/items/:itemId` — desconecta de verdade.
 *
 * Fecha a pendência que a T-089a deixou explícita: `unlinkPluggyItem` apaga só a
 * nossa linha, e revogar do lado da Pluggy é chamada de Integração, que cabe a
 * quem orquestra — esta rota.
 *
 * **Ordem: revoga na Pluggy primeiro, apaga a linha depois.** Ao contrário, uma
 * falha na revogação deixaria o item vivo lá (sincronizando e, no plano pago,
 * sendo cobrado) sem nenhuma linha nossa por onde tentar de novo — órfão
 * invisível. Nesta ordem, a falha na revogação aborta a operação com a linha
 * intacta, e o usuário pode repetir.
 */
router.delete(
  '/items/:itemId',
  requireAuth,
  requirePluggyEnabled,
  requireActiveSubscription,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const itemId = String(req.params.itemId ?? '').trim();

    const items = await listPluggyItems({ db, userId });
    if (!items.some((item) => item.itemId === itemId)) {
      res.status(404).json({ error: 'Conexão não encontrada' });
      return;
    }

    await deletePluggyItem(itemId);
    await unlinkPluggyItem({ db, userId, itemId });

    res.status(204).end();
  })
);

/**
 * `POST /api/pluggy/sync` — o gatilho de importação (fase (d) da T-089).
 *
 * Sem isto o usuário conecta o banco, nada aparece e a integração parece
 * quebrada — era a lacuna que sobrava depois do botão.
 *
 * ## `mode`
 *
 * - `append` (default): grava por cima do que existe; o dedupe por `external_id`
 *   (T-084) faz a reimportação reportar duplicatas em vez de duplicar linha.
 * - `replace`: **apaga TODOS** os lançamentos do usuário — renda, despesa e
 *   poupança, manuais e de OFX inclusive — e só então importa. Decisão do humano
 *   (2026-08-12), tomada com o risco apresentado. Não há desfazer, e a
 *   importação repõe apenas a janela sincronizada das contas conectadas: a
 *   poupança, que a Pluggy não escreve, não volta. A UI é obrigada a dizer isso
 *   antes de confirmar (ver `pluggyImport.ts` no web).
 *
 * O wipe roda **depois** de o sync ter sido preparado mas **antes** de gravar —
 * na prática, logo antes do `syncPluggyItems`. Fazê-lo depois apagaria o que
 * acabou de ser importado.
 */
router.post(
  '/sync',
  requireAuth,
  requirePluggyEnabled,
  requireActiveSubscription,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const rawMode = req.body?.mode;
    const mode = rawMode === 'replace' ? 'replace' : 'append';

    if (rawMode !== undefined && rawMode !== 'append' && rawMode !== 'replace') {
      // Modo desconhecido não vira `append` em silêncio: um cliente que mandou
      // `mode: 'REPLACE'` querendo limpar tudo receberia "sucesso" sem limpar.
      res.status(400).json({ error: "mode deve ser 'append' ou 'replace'" });
      return;
    }

    const rawDateFrom = req.body?.dateFrom;
    if (rawDateFrom !== undefined && !isValidIsoDate(String(rawDateFrom))) {
      res.status(400).json({ error: 'dateFrom deve ser uma data YYYY-MM-DD real' });
      return;
    }
    const dateFrom = rawDateFrom ? String(rawDateFrom) : defaultDateFrom();

    const items = await listPluggyItems({ db, userId });
    if (items.length === 0) {
      // Desfecho próprio, não "0 importadas, sucesso" (doutrina da T-089a): é a
      // falha silenciosa mais provável da integração.
      res.status(409).json({
        error: 'Nenhum banco conectado. Conecte uma instituição antes de importar.',
        code: 'NO_PLUGGY_ITEMS',
      });
      return;
    }

    const wiped = mode === 'replace' ? await wipeUserFinancialEntries({ db, userId }) : undefined;

    const report = await syncPluggyItems({
      db,
      userId,
      dateFrom,
      deps: {
        fetchAccounts: (itemId) => fetchPluggyAccounts(itemId),
        fetchTransactions: ({ accountId, dateFrom: from }) =>
          fetchPluggyTransactions({ accountId, dateFrom: from }),
      },
    });

    const errors: string[] = [];
    const transactions: PluggySyncResponse['transactions'] = [];
    for (const item of report.items) {
      if (item.error) errors.push(`${item.connectorName ?? 'Conexão'}: ${item.error}`);
      for (const account of item.accounts) {
        if (account.error) errors.push(`${account.label}: ${account.error}`);
        if (account.result) transactions.push(...account.result.transactions);
      }
    }

    const body: PluggySyncResponse = {
      mode,
      dateFrom,
      totals: report.totals,
      failures: report.failures,
      errors,
      transactions,
      ...(wiped ? { wiped } : {}),
    };
    // 200 mesmo com falhas parciais: a sincronização importou o que deu, e o
    // relatório diz o que não deu — mesma convenção do relatório do OFX (T-085).
    res.json(body);
  })
);

/**
 * Erro da Pluggy vira 502, não 500: a falha é de um terceiro, não nossa, e a
 * mensagem do `PluggyApiError` já é acionável e livre de credencial (ver
 * `packages/pluggy-core/CLAUDE.md`). Sem isto, o `errorHandler` global
 * responderia 500 com mensagem genérica e o usuário não saberia que o problema
 * é do lado do banco/agregador.
 */
router.use((err: unknown, _req: Request, res: Response, next: (e?: unknown) => void): void => {
  if (err instanceof PluggyApiError) {
    res.status(502).json({ error: err.message, code: 'PLUGGY_UNAVAILABLE' });
    return;
  }
  next(err);
});

export default router;
