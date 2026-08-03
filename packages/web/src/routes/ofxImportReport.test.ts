import { describe, expect, it } from 'vitest';
import type { OfxImportResult, OfxImportTransaction } from '@vetor-wallet/shared';
import {
  formatOfxCounts,
  formatOfxRejectionReason,
  formatOfxTransactionAmount,
  formatOfxTransactionDate,
  formatOfxTransactionDescription,
  groupOfxTransactionsByStatus,
  ofxStatusLabel,
} from './ofxImportReport';

describe('formatOfxCounts', () => {
  it('junta as três contagens com ponto separador', () => {
    const result: OfxImportResult = { imported: 3, duplicated: 1, rejected: 2, transactions: [] };
    expect(formatOfxCounts(result)).toBe('3 importadas · 1 duplicada · 2 rejeitadas');
  });

  it('usa singular quando a contagem é 1', () => {
    const result: OfxImportResult = { imported: 1, duplicated: 0, rejected: 0, transactions: [] };
    expect(formatOfxCounts(result)).toBe('1 importada');
  });

  it('omite categorias com contagem zero (reimport 100% duplicado)', () => {
    const result: OfxImportResult = { imported: 0, duplicated: 5, rejected: 0, transactions: [] };
    expect(formatOfxCounts(result)).toBe('5 duplicadas');
  });

  it('extrato sem nenhuma transação tem mensagem própria', () => {
    const result: OfxImportResult = { imported: 0, duplicated: 0, rejected: 0, transactions: [] };
    expect(formatOfxCounts(result)).toBe('Nenhuma transação encontrada no extrato.');
  });
});

describe('ofxStatusLabel', () => {
  it('traduz os três status para pt-BR', () => {
    expect(ofxStatusLabel('imported')).toBe('Importada');
    expect(ofxStatusLabel('duplicated')).toBe('Duplicada');
    expect(ofxStatusLabel('rejected')).toBe('Rejeitada');
  });
});

describe('groupOfxTransactionsByStatus', () => {
  it('agrupa preservando a ordem original dentro de cada grupo', () => {
    const transactions: OfxImportTransaction[] = [
      { status: 'imported', fitid: '1' },
      { status: 'rejected', reason: 'FITID ausente' },
      { status: 'imported', fitid: '2' },
      { status: 'duplicated', fitid: '3' },
    ];
    const grouped = groupOfxTransactionsByStatus(transactions);
    expect(grouped.imported.map((t) => t.fitid)).toEqual(['1', '2']);
    expect(grouped.duplicated.map((t) => t.fitid)).toEqual(['3']);
    expect(grouped.rejected).toHaveLength(1);
  });

  it('lida com lista vazia', () => {
    expect(groupOfxTransactionsByStatus([])).toEqual({
      imported: [],
      duplicated: [],
      rejected: [],
    });
  });
});

describe('formatOfxTransactionDate', () => {
  it('converte YYYY-MM-DD para DD/MM', () => {
    expect(formatOfxTransactionDate({ status: 'imported', date: '2026-07-10' })).toBe('10/07');
  });

  it('devolve — quando a data está ausente ou fora do formato', () => {
    expect(formatOfxTransactionDate({ status: 'rejected' })).toBe('—');
    expect(formatOfxTransactionDate({ status: 'rejected', date: 'lixo' })).toBe('—');
  });
});

describe('formatOfxTransactionAmount', () => {
  it('formata despesa com sinal negativo', () => {
    expect(
      formatOfxTransactionAmount({ status: 'imported', amount: 150, entryType: 'expense' }),
    ).toBe('-R$ 150,00');
  });

  it('formata renda com sinal positivo', () => {
    expect(
      formatOfxTransactionAmount({ status: 'imported', amount: 200, entryType: 'income' }),
    ).toBe('R$ 200,00');
  });

  it('devolve — quando o valor não pôde ser lido (rejeitada por TRNAMT)', () => {
    expect(formatOfxTransactionAmount({ status: 'rejected', reason: 'TRNAMT inválido' })).toBe(
      '—',
    );
  });
});

describe('formatOfxTransactionDescription', () => {
  it('usa a descrição quando presente', () => {
    expect(formatOfxTransactionDescription({ status: 'imported', description: 'Mercado' })).toBe(
      'Mercado',
    );
  });

  it('usa fallback quando ausente', () => {
    expect(formatOfxTransactionDescription({ status: 'rejected' })).toBe('(sem descrição)');
  });
});

describe('formatOfxRejectionReason', () => {
  it('devolve o motivo do server (já em pt-BR)', () => {
    expect(
      formatOfxRejectionReason({ status: 'rejected', reason: 'FITID ausente' }),
    ).toBe('FITID ausente');
  });

  it('usa fallback quando o motivo não veio', () => {
    expect(formatOfxRejectionReason({ status: 'rejected' })).toBe('Motivo não informado');
  });
});
