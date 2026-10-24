import { Router } from 'express';
import { db } from '@vetor-wallet/db';
import { createSqliteQuery } from '@vetor-wallet/query';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { getSnapshotHistory } from '@vetor-wallet/portfolio-core';

const router = Router();

// `portfolio-core` fala `Query` (T-114): o adaptador traduz `$1, $2…` para o
// libSQL de hoje.
const query = createSqliteQuery(db);

router.get(
  '/:ticker',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;

    const data = await getSnapshotHistory({ query, ticker, from, to });
    res.json(data);
  })
);

export default router;
