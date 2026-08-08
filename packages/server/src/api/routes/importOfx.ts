import { Router, Request, Response } from 'express';
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import {
  decodeOfx,
  insertEntryWithExternalId,
  mapOfxTransaction,
  parseOfx,
  parseOfxAmount,
  parseOfxDate,
} from '@vetor-wallet/bank-import-core';
import type { OfxImportResult, OfxImportTransaction } from '@vetor-wallet/shared';

/**
 * `POST /api/import/ofx` — importa um extrato OFX de conta/cartão (T-085).
 *
 * ## Payload
 *
 * O arquivo vai **cru no corpo** (`express.raw` com `type` curinga, 1 MB),
 * não em `multipart/form-data`: o CSV de operações já usa corpo de texto puro
 * (`POST /api/import`), a UI da T-086 manda um `fetch(file)` de uma linha sem
 * `FormData` nem dependência de parser de upload, e o `Buffer` é justamente o
 * que o parser precisa para decidir o charset (ver `@vetor-wallet/bank-import-core`). 1 MB
 * cobre com folga um extrato anual (OFX é ~200 B por transação).
 *
 * `express.raw` também é o precedente do webhook AbacatePay — mas aqui o motivo
 * é charset, não HMAC, e este router é montado DEPOIS do `express.json()`
 * global sem problema: `json()` ignora um corpo que não é `application/json`.
 *
 * ## Resposta: relatório por transação, sempre 200
 *
 * O contrato é `OfxImportResult` (em `shared/`): contadores + uma linha por
 * transação com `status: 'imported' | 'duplicated' | 'rejected'`. Decisão travada
 * na T-084: **duplicata em lote não é 409** (isso é o POST unitário) — vira linha
 * do relatório com `200`, porque reimportar o mesmo extrato é o caminho normal e
 * um extrato 100% duplicado não é uma request falha. `400` fica só para o
 * documento inteiro: corpo vazio ou arquivo que não é OFX.
 *
 * ## Gate de assinatura
 *
 * `requireActiveSubscription` é obrigatório aqui: a rota escreve nas MESMAS
 * tabelas de `income_entries`/`expense_entries`, que já são gateadas nos seus
 * routers. Sem isso, a importação seria o caminho de escrita sem assinatura.
 */
const router = Router();

const OFX_BODY_LIMIT = '1mb';

router.post(
  '/',
  requireAuth,
  requireActiveSubscription,
  express.raw({ type: '*/*', limit: OFX_BODY_LIMIT }),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;

    const body: Buffer | string = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
        ? req.body
        : '';
    const content = decodeOfx(body);
    if (!content.trim()) {
      res.status(400).json({ error: 'Body vazio' });
      return;
    }

    const parsed = parseOfx(content);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const transactions: OfxImportTransaction[] = [];
    let imported = 0;
    let duplicated = 0;
    let rejected = 0;

    // Sequencial de propósito: cada INSERT precisa VER o anterior para que duas
    // transações com o MESMO FITID no mesmo arquivo (banco que repete linha)
    // caiam como duplicata em vez de estourar o índice único num batch.
    for (const raw of parsed.transactions) {
      const mapped = mapOfxTransaction(raw);
      if (!mapped.ok) {
        rejected++;
        // Campos crus quando legíveis: identificam a linha na UI mesmo quando
        // foi outro campo que derrubou a transação.
        const rawDate = parseOfxDate(raw.dtposted);
        const rawAmount = parseOfxAmount(raw.trnamt);
        const rawDescription = raw.memo ?? raw.name;
        transactions.push({
          status: 'rejected',
          reason: mapped.reason,
          ...(raw.fitid ? { fitid: raw.fitid } : {}),
          ...(rawDate ? { date: rawDate } : {}),
          ...(rawAmount !== null ? { amount: Math.abs(rawAmount) } : {}),
          ...(rawDescription ? { description: rawDescription } : {}),
        });
        continue;
      }

      const tx = mapped.transaction;
      const isIncome = tx.entryType === 'income';
      const result = await insertEntryWithExternalId({
        table: isIncome ? 'income_entries' : 'expense_entries',
        userId,
        values: isIncome
          ? { description: tx.description, amount: tx.amount, date: tx.date }
          : {
              description: tx.description,
              amount: tx.amount,
              date: tx.date,
              category: tx.category,
            },
        externalId: tx.externalId,
      });

      const entryId = result.row ? Number(result.row.id) : undefined;
      if (result.status === 'duplicate') duplicated++;
      else imported++;
      transactions.push({
        status: result.status === 'duplicate' ? 'duplicated' : 'imported',
        fitid: tx.fitid,
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        entryType: tx.entryType,
        ...(entryId !== undefined ? { entryId } : {}),
      });
    }

    const result: OfxImportResult = { imported, duplicated, rejected, transactions };
    res.json(result);
  })
);

export default router;
