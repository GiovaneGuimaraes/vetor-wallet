import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { searchTickers } from '../services/tickers';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const query = typeof req.query.search === 'string' ? req.query.search : '';
    const response = await searchTickers(query);
    res.json(response);
  }),
);

export default router;
