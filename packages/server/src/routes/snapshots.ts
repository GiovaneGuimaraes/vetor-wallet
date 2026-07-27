import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { getSnapshotHistory } from '../services/snapshots';

const router = Router();

router.get(
  '/:ticker',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;

    const data = await getSnapshotHistory(ticker, from, to);
    res.json(data);
  }),
);

export default router;
