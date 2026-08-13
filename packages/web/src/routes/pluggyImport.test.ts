import { describe, it, expect } from 'vitest';
import type { PluggySyncResponse } from '@vetor-wallet/shared';
import {
  PLUGGY_BRAND,
  REPLACE_CONFIRM_WORD,
  canConfirmReplace,
  connectionSummary,
  formatPluggyCounts,
  groupPluggyTransactions,
  importButtonLabel,
  importDisabledReason,
  internalMovementNote,
  pluggySecurityNotes,
  replaceWarnings,
  statusTone,
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

describe('importDisabledReason (T-089f)', () => {
  it('explica que falta conectar um banco', () => {
    // Antes disto o botão ficava `disabled` sem dizer nada — beco sem saída.
    expect(importDisabledReason({ hasItems: false, mode: 'append', confirmText: '' })).toMatch(
      /Conecte um banco/
    );
  });

  it('a falta de conexão vence a falta de confirmação', () => {
    const reason = importDisabledReason({ hasItems: false, mode: 'replace', confirmText: '' });
    expect(reason).toMatch(/Conecte um banco/);
  });

  it('no replace, cobra a palavra de confirmação', () => {
    expect(importDisabledReason({ hasItems: true, mode: 'replace', confirmText: '' })).toContain(
      REPLACE_CONFIRM_WORD
    );
  });

  it('libera com banco conectado no append', () => {
    expect(importDisabledReason({ hasItems: true, mode: 'append', confirmText: '' })).toBeNull();
  });

  it('libera no replace depois da palavra digitada', () => {
    expect(
      importDisabledReason({ hasItems: true, mode: 'replace', confirmText: 'apagar' })
    ).toBeNull();
  });
});

describe('connectionSummary (T-089f)', () => {
  it('singular, plural e vazio', () => {
    expect(connectionSummary(0)).toBe('Nenhum banco conectado');
    expect(connectionSummary(1)).toBe('1 banco conectado');
    expect(connectionSummary(3)).toBe('3 bancos conectados');
  });
});

describe('pluggySecurityNotes (T-089f)', () => {
  it('diz que o app NUNCA recebe a credencial do banco', () => {
    // Precisa ser verdade ao pé da letra: quem digita a senha merece saber para
    // onde ela vai. O widget é da Pluggy; o que volta para nós é só o itemId.
    expect(pluggySecurityNotes().join(' ')).toMatch(/nunca as recebe/i);
  });

  it('diz que o acesso é somente leitura e que dá para desconectar', () => {
    const text = pluggySecurityNotes().join(' ');
    expect(text).toMatch(/somente de leitura/i);
    expect(text).toMatch(/desconectar/i);
  });

  it('nomeia a Pluggy — a integração não fica escondida', () => {
    expect(pluggySecurityNotes().join(' ')).toContain(PLUGGY_BRAND.name);
  });
});

describe('statusTone (T-089f)', () => {
  it('só `rejected` pede atenção; rotina fica neutra', () => {
    expect(statusTone('imported')).toBe('good');
    expect(statusTone('previewed')).toBe('good');
    expect(statusTone('rejected')).toBe('warn');
    // Pintar movimentação interna de amarelo faria relatório saudável parecer
    // problema — mesma razão de `internal` não ser `rejected` no core (T-088).
    expect(statusTone('internal')).toBe('muted');
    expect(statusTone('duplicated')).toBe('muted');
    expect(statusTone('skipped')).toBe('muted');
  });
});
