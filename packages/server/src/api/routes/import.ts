import { Router, Request, Response } from 'express';
import express from 'express';
import { db } from '../../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import { buildPositionMap, applyOperation, wouldExceedPosition } from '../services/portfolio';
import { getUnknownTickers } from '../services/tickers';
import { isValidIsoDate } from '../services/dates';
import { getOrCreateDefaultWallet } from '../services/wallets';
import { isValidMoneyAmount, moneyAmountError } from '../services/money';
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
    if (!Number.isFinite(quantity) || quantity <= 0) colErrors.push('quantidade inválida');
    const price = parseFloat(priceStr);
    if (!Number.isFinite(price) || price <= 0) colErrors.push('preço inválido');
    // T-059: mesmo padrão da T-052 (isValidMoneyAmount), aplicado a price no CSV.
    // T-065: o rótulo era 'price' (inglês, incoerente com as outras mensagens de
    // erro desta rota, todas em pt-BR — ex.: 'quantidade inválida' logo acima) e
    // também podia soar como se falasse do campo `quantity`; 'preço' identifica
    // exatamente a coluna e casa com o `moneyAmountError` (T-065a) que já decide
    // entre 'casas decimais' e 'limite máximo' sozinho.
    else if (!isValidMoneyAmount(price)) colErrors.push(moneyAmountError(price, 'preço'));
    if (!isValidIsoDate(date)) colErrors.push('data inválida (use YYYY-MM-DD)');

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
  requireActiveSubscription,
  express.text({ type: '*/*', limit: '1mb' }),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    // `?walletId=` é ignorado (T-050): tudo é importado na carteira padrão do
    // usuário e a posição de SELL é o consolidado dele.
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
      const walletId = await getOrCreateDefaultWallet(userId);
      await db.batch(
        valid.map((op) => ({
          sql: 'INSERT INTO operations (ticker, type, quantity, price, date, user_id, wallet_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [op.ticker, op.type, op.quantity, op.price, op.date, userId, walletId],
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
