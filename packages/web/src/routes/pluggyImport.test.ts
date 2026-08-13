import { describe, it, expect } from 'vitest';
import type { PluggySyncResponse } from '@vetor-wallet/shared';
import {
  REPLACE_CONFIRM_WORD,
  canConfirmReplace,
  formatPluggyCounts,
  groupPluggyTransactions,
  importButtonLabel,
  internalMovementNote,
  replaceWarnings,
} from './pluggyImport';

function totals(over: Partial<PluggySyncResponse['totals']> = {}): PluggySyncResponse['totals'] {
  return {
    imported: 0,
    duplicated: 0,
    rejected: 0,
    skipped: 0,
    internal: 0,
    previewed: 0,
    ...over,
  };
}

describe('canConfirmReplace (T-089c)', () => {
  it('libera só com a palavra exata', () => {
    expect(canConfirmReplace(REPLACE_CONFIRM_WORD)).toBe(true);
  });

  it('aceita caixa e espaço diferentes — a barreira é a intenção', () => {
    expect(canConfirmReplace('  apagar ')).toBe(true);
    expect(canConfirmReplace('Apagar')).toBe(true);
  });

  it('não libera com vazio, parcial ou outra palavra', () => {
    for (const typed of ['', '   ', 'APAG', 'APAGARR', 'sim', 'confirmar']) {
      expect(canConfirmReplace(typed), typed).toBe(false);
    }
  });
});

describe('replaceWarnings (T-089c)', () => {
  it('diz que a poupança NÃO volta — a consequência menos óbvia', () => {
    expect(replaceWarnings().join(' ')).toMatch(/poupança não volta/i);
  });

  it('diz que apaga lançamento manual e que não há desfazer', () => {
    const text = replaceWarnings().join(' ');
    expect(text).toMatch(/digitou à mão/i);
    expect(text).toMatch(/desfazer/i);
  });

  it('avisa que a janela sincronizada é limitada', () => {
    expect(replaceWarnings().join(' ')).toMatch(/30 dias/);
  });
});

describe('formatPluggyCounts (T-089c)', () => {
  it('omite contagem zero', () => {
    const text = formatPluggyCounts(totals({ imported: 2, internal: 1 }));
    expect(text).toBe('2 transações importadas, 1 movimentação interna.');
    expect(text).not.toContain('0 ');
  });

  it('singular e plural', () => {
    expect(formatPluggyCounts(totals({ imported: 1 }))).toBe('1 transação importada.');
    expect(formatPluggyCounts(totals({ duplicated: 3 }))).toBe('3 já existiam.');
  });

  it('lote sem novidade tem frase própria, não string vazia', () => {
    // "" na tela parece bug de renderização.
    expect(formatPluggyCounts(totals())).toBe('Nenhuma transação nova no período.');
  });
});

describe('internalMovementNote (T-089c)', () => {
  it('explica a contagem quando há interna', () => {
    expect(internalMovementNote(totals({ internal: 2 }))).toMatch(/fatura/i);
  });

  it('some quando não há nenhuma', () => {
    expect(internalMovementNote(totals())).toBeNull();
  });
});

describe('groupPluggyTransactions (T-089c)', () => {
  const lines: PluggySyncResponse['transactions'] = [
    { status: 'rejected', reason: 'moeda' },
    { status: 'imported', transactionId: 'a' },
    { status: 'internal', reason: 'fatura' },
    { status: 'imported', transactionId: 'b' },
  ];

  it('agrupa na ordem de exibição, com o que pede atenção por último', () => {
    expect(groupPluggyTransactions(lines).map((g) => g.status)).toEqual([
      'imported',
      'internal',
      'rejected',
    ]);
  });

  it('preserva a ordem original dentro do grupo', () => {
    const imported = groupPluggyTransactions(lines)[0];
    expect(imported.lines.map((l) => l.transactionId)).toEqual(['a', 'b']);
  });

  it('não devolve grupo vazio', () => {
    expect(groupPluggyTransactions([])).toEqual([]);
  });
});

describe('importButtonLabel (T-089c)', () => {
  it('deixa o modo destrutivo explícito no próprio botão', () => {
    expect(importButtonLabel('replace')).toMatch(/apagar/i);
    expect(importButtonLabel('append')).not.toMatch(/apagar/i);
  });
});
