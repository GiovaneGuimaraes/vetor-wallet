import { Router, Request, Response } from 'express';
import express from 'express';
import { db } from '../db';
import type { NewOperation, CsvRowError, CsvImportResult } from '@vetor-wallet/shared';

const router = Router();

function parseRows(body: string): { valid: NewOperation[]; errors: CsvRowError[] } {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const valid: NewOperation[] = [];
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
      valid.push({
        ticker: ticker.toUpperCase(),
        type: type as 'BUY' | 'SELL',
        quantity,
        price,
        date,
      });
    }
  }

  return { valid, errors };
}

router.post(
  '/',
  express.text({ type: '*/*', limit: '1mb' }),
  async (req: Request, res: Response) => {
    const body = typeof req.body === 'string' ? req.body : '';
    if (!body.trim()) {
      res.status(400).json({ error: 'Body vazio' });
      return;
    }

    const { valid, errors } = parseRows(body);

    if (valid.length > 0) {
      await db.batch(
        valid.map((op) => ({
          sql: 'INSERT INTO operations (ticker, type, quantity, price, date) VALUES (?, ?, ?, ?, ?)',
          args: [op.ticker, op.type, op.quantity, op.price, op.date],
        })),
        'write',
      );
    }

    const result: CsvImportResult = { imported: valid.length, errors };
    res.json(result);
  },
);

export default router;
