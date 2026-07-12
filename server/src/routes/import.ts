import { Router, Request, Response } from 'express';
import express from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { buildPositionMap, applyOperation, wouldExceedPosition } from '../services/portfolio';
import { getUnknownTickers } from '../services/tickers';
import type { NewOperation, CsvRowError, CsvImportResult, Operation } from '@vetor-wallet/shared';

const router = Router();

interface ParsedRow {
  line: number;
  raw: string;
  op: NewOperation;
}

function parseRows(body: string): { rows: ParsedRow[]; errors: CsvRowError[] } {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];
  const errors: CsvRowError[] = [];

  const start = lines.length > 0 && /ticker/i.test(lines[0]) ? 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const cols = raw.split(',').map((c) => c.trim());

    if (cols.length !== 5) {
      errors.push({ line: lineNum, raw, error: `esperado 5 colunas, encontrado ${cols.length}` });
      continue;
    }

    const [ticker, typeRaw, quantityStr, priceStr, date] = cols;
    const type = typeRaw.toUpperCase();
    const colErrors: string[] = [];

    if (!ticker || !/^[A-Za-z0-9]{1,10}$/.test(ticker)) colErrors.push('ticker inválido');
    if (type !== 'BUY' && type !== 'SELL') colErrors.push('tipo deve ser BUY ou SELL');
    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity) || quantity <= 0) colErrors.push('quantidade inválida');
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) colErrors.push('preço inválido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) colErrors.push('data inválida (use YYYY-MM-DD)');

    if (colErrors.length > 0) {
      errors.push({ line: lineNum, raw, error: colErrors.join('; ') });
    } else {
      rows.push({
        line: lineNum,
        raw,
        op: {
          ticker: ticker.toUpperCase(),
          type: type as 'BUY' | 'SELL',
          quantity,
          price,
          date,
        },
      });
    }
  }

  return { rows, errors };
}

router.post(
  '/',
  requireAuth,
  express.text({ type: '*/*', limit: '1mb' }),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const body = typeof req.body === 'string' ? req.body : '';
    if (!body.trim()) {
      res.status(400).json({ error: 'Body vazio' });
      return;
    }

    const { rows, errors } = parseRows(body);

    const tickers = [...new Set(rows.map((r) => r.op.ticker))];
    let positionMap = new Map<string, { quantity: number; avgPrice: number }>();
    if (tickers.length > 0) {
      const placeholders = tickers.map(() => '?').join(',');
      const existing = await db.execute({
        sql: `SELECT * FROM operations WHERE ticker IN (${placeholders}) AND user_id = ? ORDER BY date ASC, created_at ASC`,
        args: [...tickers, userId],
      });
      positionMap = buildPositionMap(existing.rows as unknown as Operation[]);
    }

    const valid: NewOperation[] = [];
    for (const row of rows) {
      if (row.op.type === 'SELL' && wouldExceedPosition(positionMap, row.op.ticker, row.op.quantity)) {
        errors.push({
          line: row.line,
          raw: row.raw,
          error: 'venda maior que a posicao atual',
        });
        continue;
      }
      applyOperation(positionMap, row.op);
      valid.push(row.op);
    }
    errors.sort((a, b) => a.line - b.line);

    if (valid.length > 0) {
      await db.batch(
        valid.map((op) => ({
          sql: 'INSERT INTO operations (ticker, type, quantity, price, date, user_id) VALUES (?, ?, ?, ?, ?, ?)',
          args: [op.ticker, op.type, op.quantity, op.price, op.date, userId],
        })),
        'write',
      );
    }

    const importedTickers = [...new Set(valid.map((op) => op.ticker))];
    const unknownTickers = await getUnknownTickers(importedTickers);

    const result: CsvImportResult = { imported: valid.length, errors, unknownTickers };
    res.json(result);
  }),
);

export default router;
