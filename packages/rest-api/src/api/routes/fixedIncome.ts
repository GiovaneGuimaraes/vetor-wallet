import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import { createSqliteQuery } from '../sqliteQuery';
import {
  FIXED_INCOME_KINDS,
  FIXED_INCOME_RATE_TYPES,
  isFixedIncomeKind,
  isFixedIncomeRateType,
  summariseFixedIncome,
  listFixedIncomePositions,
  getFixedIncomePosition,
  createFixedIncomePosition,
  updateFixedIncomePosition,
  deleteFixedIncomePosition,
} from '@vetor-wallet/fixed-income-core';
import {
  isValidIsoDate,
  isValidMoneyAmount,
  moneyAmountError,
} from '@vetor-wallet/validation-core';
import { listPluggyItems } from '@vetor-wallet/bank-import-core';
import {
  fetchPluggyInvestments,
  isPluggyIntegrationEnabled,
  PluggyApiError,
  toPluggyFixedIncomePosition,
} from '@vetor-wallet/pluggy-core';
import type {
  FixedIncomePositionUpdate,
  NewFixedIncomePosition,
  PluggyFixedIncomePosition,
  PluggyFixedIncomeResponse,
} from '@vetor-wallet/shared';

/**
 * `/api/fixed-income` — Renda Fixa manual (T-091c/d, fatia c1).
 *
 * A validação de entrada vive AQUI, não no core (mesma convenção de
 * `alerts-core`/`operations-core`): é entrada de usuário, não acesso a dado.
 * O core recebe o corpo já validado.
 *
 * Corpo em camelCase (como `externalId`/`walletId` no resto da API); a resposta
 * é a linha do banco, em snake_case.
 */
const router = Router();

// Mesma ponte da `routes/savings.ts` (T-113): o core fala `Query` com `$1, $2…`
// e este adaptador os traduz para o libSQL de hoje.
const query = createSqliteQuery(db);

router.use(requireAuth);
router.use(requireActiveSubscription);

const NOT_FOUND = 'Posição de renda fixa não encontrada';

type Body = Record<string, unknown>;

/** Valida os campos PRESENTES no corpo. Devolve a mensagem do 400, ou `null`. */
function validateFields(body: Body): string | null {
  const {
    name,
    kind,
    institution,
    investedAmount,
    investedAt,
    maturityDate,
    rateType,
    rate,
    currentValue,
    currentValueDate,
  } = body;

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return 'name obrigatório';
  }
  if (kind !== undefined && !isFixedIncomeKind(kind)) {
    return `kind deve ser um de: ${FIXED_INCOME_KINDS.join(', ')}`;
  }
  if (institution !== undefined && typeof institution !== 'string') {
    return 'institution deve ser texto';
  }
  if (investedAmount !== undefined) {
    if (
      typeof investedAmount !== 'number' ||
      !Number.isFinite(investedAmount) ||
      investedAmount <= 0
    ) {
      return 'investedAmount deve ser um número maior que 0';
    }
    if (!isValidMoneyAmount(investedAmount))
      return moneyAmountError(investedAmount, 'investedAmount');
  }
  if (investedAt !== undefined && !isValidIsoDate(investedAt)) {
    return 'investedAt inválida (use YYYY-MM-DD)';
  }
  if (maturityDate !== undefined && maturityDate !== null && !isValidIsoDate(maturityDate)) {
    return 'maturityDate inválida (use YYYY-MM-DD ou null)';
  }
  if (rateType !== undefined && !isFixedIncomeRateType(rateType)) {
    return `rateType deve ser um de: ${FIXED_INCOME_RATE_TYPES.join(', ')}`;
  }
  if (rate !== undefined && (typeof rate !== 'number' || !Number.isFinite(rate))) {
    return 'rate deve ser um número';
  }

  // O saldo informado só faz sentido com a data em que foi lido: os dois vêm
  // juntos (com valor, ou ambos `null` para limpar), ou nenhum dos dois.
  const valueSent = currentValue !== undefined;
  const dateSent = currentValueDate !== undefined;
  if (
    valueSent !== dateSent ||
    (valueSent && (currentValue === null) !== (currentValueDate === null))
  ) {
    return 'currentValue e currentValueDate vêm juntos, ou nenhum dos dois';
  }
  if (currentValue !== undefined && currentValue !== null) {
    if (typeof currentValue !== 'number' || !Number.isFinite(currentValue) || currentValue < 0) {
      return 'currentValue deve ser um número maior ou igual a 0';
    }
    if (!isValidMoneyAmount(currentValue)) return moneyAmountError(currentValue, 'currentValue');
  }
  if (
    currentValueDate !== undefined &&
    currentValueDate !== null &&
    !isValidIsoDate(currentValueDate)
  ) {
    return 'currentValueDate inválida (use YYYY-MM-DD)';
  }
  return null;
}

/** `YYYY-MM-DD` compara certo como string. */
function maturityBeforeInvestment(investedAt: string, maturityDate: string | null): boolean {
  return maturityDate !== null && maturityDate < investedAt;
}

const MATURITY_ERROR = 'maturityDate não pode ser anterior a investedAt';

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const positions = await listFixedIncomePositions({ query, userId });
    res.json({ positions, summary: summariseFixedIncome(positions) });
  })
);

/**
 * `GET /api/fixed-income/pluggy` — Renda Fixa da conexão bancária, **lida ao
 * vivo** (T-091d, fatia d2).
 *
 * ## Nunca grava
 *
 * Decisão do humano (P1, 2026-10-21), mesma doutrina da T-089e ("saldo é
 * posição, não lançamento"): a posição da Pluggy é lida a cada acesso e
 * devolvida, e nada dela toca `fixed_income_positions` nem tabela alguma. A
 * única leitura de banco aqui é `listPluggyItems` (quais conexões o usuário tem).
 *
 * ## Rota irmã, não campo a mais no `GET /`
 *
 * O `GET /` (RF manual) segue sem saber que a Pluggy existe: nenhuma falha,
 * lentidão (timeout de 15s por request) ou credencial ausente da Pluggy chega
 * perto dele. É o isolamento de falha mais forte possível — no servidor, por
 * construção, e no web, porque são duas chamadas independentes.
 *
 * ## Desfechos (sempre 200)
 *
 * - integração desligada (gate `ENVIRONMENT`) → `enabled: false`, sem consultar
 *   banco nem Pluggy. Mesmo gate das `/api/pluggy/*`: o que ele protege é o
 *   termo de uso do Meu Pluggy (gratuito só para uso pessoal), e **ler** dado de
 *   um item já conectado é tão "usar a integração" quanto conectar um novo;
 * - sem conexão → `connections: 0`, sem chamar a Pluggy;
 * - item que falha (rede, 4xx/5xx, credencial ausente) → conta em
 *   `failedConnections` e os outros items seguem. Falha da Pluggy NUNCA vira
 *   500/502 aqui: é o web quem decide como avisar, e o resto da tela continua.
 */
router.get(
  '/pluggy',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;

    if (!isPluggyIntegrationEnabled()) {
      const body: PluggyFixedIncomeResponse = {
        enabled: false,
        connections: 0,
        failedConnections: 0,
        positions: [],
        otherInvestments: 0,
      };
      res.json(body);
      return;
    }

    const items = await listPluggyItems({ db, userId });
    const results = await Promise.allSettled(
      items.map((item) => fetchPluggyInvestments(item.itemId))
    );

    const positions: PluggyFixedIncomePosition[] = [];
    let failedConnections = 0;
    let otherInvestments = 0;
    for (const result of results) {
      if (result.status === 'rejected') {
        failedConnections++;
        // Só o tipo do erro: a mensagem é livre de credencial (pluggy-core),
        // mas o itemId não entra em log de jeito nenhum.
        console.warn(
          '[fixed-income/pluggy] leitura de investimentos falhou:',
          result.reason instanceof PluggyApiError ? result.reason.message : 'erro inesperado'
        );
        continue;
      }
      for (const investment of result.value) {
        const position = toPluggyFixedIncomePosition(investment);
        if (position === null) otherInvestments++;
        else positions.push(position);
      }
    }

    const body: PluggyFixedIncomeResponse = {
      enabled: true,
      connections: items.length,
      failedConnections,
      positions,
      otherInvestments,
    };
    res.json(body);
  })
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const body = (req.body ?? {}) as Body;

    for (const field of ['name', 'kind', 'investedAmount', 'investedAt', 'rateType', 'rate']) {
      if (body[field] === undefined || body[field] === null) {
        res.status(400).json({ error: `${field} obrigatório` });
        return;
      }
    }
    const error = validateFields(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const input = body as unknown as NewFixedIncomePosition;
    const maturityDate = input.maturityDate ?? null;
    if (maturityBeforeInvestment(input.investedAt, maturityDate)) {
      res.status(400).json({ error: MATURITY_ERROR });
      return;
    }

    const position = await createFixedIncomePosition({
      query,
      userId,
      position: {
        name: input.name.trim(),
        kind: input.kind,
        institution: input.institution?.trim() ?? '',
        investedAmount: input.investedAmount,
        investedAt: input.investedAt,
        maturityDate,
        rateType: input.rateType,
        rate: input.rate,
        currentValue: input.currentValue ?? null,
        currentValueDate: input.currentValueDate ?? null,
      },
    });
    res.status(201).json(position);
  })
);

/**
 * Edição parcial: campo a campo com a mesma validação da criação; corpo sem
 * nenhum campo conhecido → 400; posição de outro usuário → 404.
 *
 * `maturityDate >= investedAt` cruza dois campos, e o corpo pode trazer só um
 * deles — por isso a rota lê a posição atual antes e valida o estado FINAL.
 * Essa leitura é também a que decide o 404.
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const body = (req.body ?? {}) as Body;

    const changes: FixedIncomePositionUpdate = {
      name: body.name as string | undefined,
      kind: body.kind as FixedIncomePositionUpdate['kind'],
      institution: body.institution as string | undefined,
      investedAmount: body.investedAmount as number | undefined,
      investedAt: body.investedAt as string | undefined,
      maturityDate: body.maturityDate as string | null | undefined,
      rateType: body.rateType as FixedIncomePositionUpdate['rateType'],
      rate: body.rate as number | undefined,
      currentValue: body.currentValue as number | null | undefined,
      currentValueDate: body.currentValueDate as string | null | undefined,
    };
    if (Object.values(changes).every((value) => value === undefined)) {
      res.status(400).json({ error: 'informe ao menos um campo para atualizar' });
      return;
    }
    // `null` só é valor válido onde a coluna é opcional.
    for (const field of [
      'name',
      'kind',
      'institution',
      'investedAmount',
      'investedAt',
      'rateType',
      'rate',
    ] as const) {
      if (changes[field] === null) {
        res.status(400).json({ error: `${field} não pode ser null` });
        return;
      }
    }
    const error = validateFields(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const existing = await getFixedIncomePosition({ query, userId, id });
    if (existing === null) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    const finalInvestedAt = changes.investedAt ?? existing.invested_at;
    const finalMaturity =
      changes.maturityDate !== undefined ? changes.maturityDate : existing.maturity_date;
    if (maturityBeforeInvestment(finalInvestedAt, finalMaturity)) {
      res.status(400).json({ error: MATURITY_ERROR });
      return;
    }

    if (changes.name !== undefined) changes.name = changes.name.trim();
    if (changes.institution !== undefined) changes.institution = changes.institution.trim();

    const position = await updateFixedIncomePosition({ query, userId, id, changes });
    if (position === null) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    res.json(position);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const apagou = await deleteFixedIncomePosition({ query, userId, id });
    if (!apagou) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    res.status(204).send();
  })
);

export default router;
