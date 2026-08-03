import type { OfxImportResult, OfxImportTransaction, OfxTransactionStatus } from '@vetor-wallet/shared';

/**
 * Lógica de apresentação do relatório de importação OFX (T-086). Módulo puro
 * — a `DespesasPage` só renderiza o que estas funções calculam. O contrato de
 * dados (`OfxImportResult`) vem inteiro da T-085; aqui só decidimos como
 * agrupar/ordenar/rotular para a UI.
 */

/** Estados da seção de importação, na ordem em que a UI transita entre eles. */
export type OfxImportUiState = 'idle' | 'uploading' | 'report' | 'error';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Resumo em pt-BR das contagens — ex.: "3 importadas · 1 duplicada · 2
 * rejeitadas". Contagem zero de uma categoria não aparece (relatório de um
 * extrato só com duplicadas não deveria dizer "0 importadas").
 */
export function formatOfxCounts(result: OfxImportResult): string {
  const parts: string[] = [];
  if (result.imported > 0) {
    parts.push(`${result.imported} ${result.imported === 1 ? 'importada' : 'importadas'}`);
  }
  if (result.duplicated > 0) {
    parts.push(`${result.duplicated} ${result.duplicated === 1 ? 'duplicada' : 'duplicadas'}`);
  }
  if (result.rejected > 0) {
    parts.push(`${result.rejected} ${result.rejected === 1 ? 'rejeitada' : 'rejeitadas'}`);
  }
  if (parts.length === 0) return 'Nenhuma transação encontrada no extrato.';
  return parts.join(' · ');
}

/** Rótulo pt-BR de um status, para o selo de cada linha do relatório. */
export function ofxStatusLabel(status: OfxTransactionStatus): string {
  switch (status) {
    case 'imported':
      return 'Importada';
    case 'duplicated':
      return 'Duplicada';
    case 'rejected':
      return 'Rejeitada';
    default:
      return status;
  }
}

/**
 * Agrupa preservando a ordem original de cada grupo (a ordem do extrato) —
 * importadas primeiro (o que o usuário quer confirmar), depois duplicadas,
 * depois rejeitadas (o que precisa de atenção fica visível, mas não primeiro
 * — reimportar o mesmo arquivo é o caminho normal, não um erro).
 */
export interface OfxGroupedTransactions {
  imported: OfxImportTransaction[];
  duplicated: OfxImportTransaction[];
  rejected: OfxImportTransaction[];
}

export function groupOfxTransactionsByStatus(
  transactions: OfxImportTransaction[],
): OfxGroupedTransactions {
  const grouped: OfxGroupedTransactions = { imported: [], duplicated: [], rejected: [] };
  for (const tx of transactions) {
    grouped[tx.status].push(tx);
  }
  return grouped;
}

/** `2026-07-10` → `10/07`. Datas ausentes/fora do formato voltam como `—`. */
export function formatOfxTransactionDate(tx: OfxImportTransaction): string {
  const match = tx.date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(tx.date) : null;
  if (!match) return '—';
  return `${match[3]}/${match[2]}`;
}

/**
 * Valor formatado com o sinal do `entryType` (renda soma, despesa subtrai) —
 * o payload guarda só o valor absoluto (`amount`), o sinal é derivado.
 * Transações rejeitadas por `TRNAMT` ilegível não têm `amount`: mostra `—`.
 */
export function formatOfxTransactionAmount(tx: OfxImportTransaction): string {
  if (tx.amount === undefined) return '—';
  const signed = tx.entryType === 'expense' ? -tx.amount : tx.amount;
  return fmtCur.format(signed);
}

/** Descrição para exibição, com fallback quando a transação nem isso trouxe. */
export function formatOfxTransactionDescription(tx: OfxImportTransaction): string {
  return tx.description ?? '(sem descrição)';
}

/** Motivo de rejeição — o server já devolve texto em pt-BR (ver ofx.ts); só cobre a ausência. */
export function formatOfxRejectionReason(tx: OfxImportTransaction): string {
  return tx.reason ?? 'Motivo não informado';
}
