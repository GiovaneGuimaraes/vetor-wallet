import type { PluggyImportMode, PluggySyncResponse } from '@vetor-wallet/shared';

/**
 * Lógica pura do fluxo de importação da Pluggy (T-089c).
 *
 * Convenção do projeto: o componente renderiza, a decisão mora aqui com teste
 * ao lado. O que está neste arquivo é justamente o que não pode quebrar em
 * silêncio — o texto de aviso do modo destrutivo e a regra que libera o botão
 * de confirmar.
 */

/** Versão do widget medida e registrada na T-087 (`packages/pluggy-core/CLAUDE.md`). */
export const PLUGGY_CONNECT_SCRIPT =
  'https://cdn.pluggy.ai/pluggy-connect/v2.7.0/pluggy-connect.js';

/** Conector `MeuPluggy` — o único que a integração usa hoje (T-087). */
export const PLUGGY_CONNECTOR_IDS = [200];

/** O que o usuário precisa digitar para liberar a limpeza total. */
export const REPLACE_CONFIRM_WORD = 'APAGAR';

/**
 * Libera o botão do modo `replace`.
 *
 * **Por que digitar uma palavra, e não só clicar.** O `replace` apaga renda,
 * despesa e poupança do usuário — todas, de qualquer data, manuais inclusive —
 * e não há desfazer. Um clique acidental num botão vermelho é um acidente
 * plausível; digitar uma palavra específica não é. É a única barreira entre um
 * clique errado e a perda do histórico inteiro.
 *
 * Aceita espaço em volta e caixa diferente: a barreira é a intenção, não a
 * datilografia.
 */
export function canConfirmReplace(typed: string): boolean {
  return typed.trim().toUpperCase() === REPLACE_CONFIRM_WORD;
}

/**
 * As consequências do `replace` que o usuário precisa ler ANTES de confirmar.
 *
 * Nenhuma delas é dedutível da palavra "substituir", e as duas primeiras foram
 * levantadas ao implementar: a Pluggy devolve só uma janela (~30 dias) das
 * contas conectadas, e **nunca** escreve poupança. Então "substituir tudo pelos
 * dados da Pluggy" não substitui — apaga muito mais do que repõe. Dizer isso na
 * tela é o que torna a confirmação informada em vez de formal.
 */
export function replaceWarnings(): string[] {
  return [
    'Apaga TODAS as suas rendas, despesas e lançamentos de poupança — inclusive os que você digitou à mão e os importados de OFX, de qualquer data.',
    'A poupança não volta: a importação da Pluggy grava renda e despesa, nunca poupança.',
    'A Pluggy devolve só a janela sincronizada (padrão: 30 dias) e apenas das contas conectadas — o que for mais antigo que isso não é reposto.',
    'Metas continuam existindo, mas o progresso calculado a partir de aportes vinculados volta a zero.',
    'Não há como desfazer.',
  ];
}

/** Rótulo em pt-BR de cada desfecho do relatório. */
const STATUS_LABEL: Record<PluggySyncResponse['transactions'][number]['status'], string> = {
  imported: 'importada',
  duplicated: 'duplicada',
  rejected: 'rejeitada',
  skipped: 'pulada',
  internal: 'interna',
  previewed: 'a importar',
};

/**
 * Resumo em pt-BR do relatório, **omitindo o que é zero**.
 *
 * Mesma regra do `formatOfxCounts` (T-086): uma sincronização 100% duplicada
 * não deveria anunciar "0 importadas". Sem nada a dizer, devolve a frase de
 * lote vazio em vez de string vazia — "" na tela parece bug de renderização.
 */
export function formatPluggyCounts(totals: PluggySyncResponse['totals']): string {
  const parts: string[] = [];
  const push = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };

  push(totals.imported, 'transação importada', 'transações importadas');
  push(totals.duplicated, 'já existia', 'já existiam');
  push(totals.internal, 'movimentação interna', 'movimentações internas');
  push(totals.skipped, 'pendente', 'pendentes');
  push(totals.rejected, 'rejeitada', 'rejeitadas');

  if (parts.length === 0) return 'Nenhuma transação nova no período.';
  return `${parts.join(', ')}.`;
}

/**
 * Frase que explica a contagem de internas — só aparece quando há alguma.
 *
 * Sem isto, "2 movimentações internas" lê como transação sumida: o usuário VÊ a
 * linha no extrato do banco e não a acha no app. Foi a mesma razão de o CLI
 * ganhar a explicação no resumo (T-088).
 */
export function internalMovementNote(totals: PluggySyncResponse['totals']): string | null {
  if (totals.internal <= 0) return null;
  return (
    'Movimentações internas são transferências entre contas suas, pagamento de fatura ' +
    'e aplicação/resgate. Não são despesa nem renda, então não entram no seu mês.'
  );
}

/** Agrupa as linhas por desfecho, preservando a ordem original dentro de cada grupo. */
export function groupPluggyTransactions(
  transactions: PluggySyncResponse['transactions']
): Array<{ status: string; label: string; lines: PluggySyncResponse['transactions'] }> {
  // Ordem de exibição: o que entrou primeiro, o que precisa de atenção por
  // último — relatório de reimportação (quase todo duplicado) não deve abrir
  // com uma parede de linhas irrelevantes.
  const order: Array<PluggySyncResponse['transactions'][number]['status']> = [
    'imported',
    'previewed',
    'internal',
    'duplicated',
    'skipped',
    'rejected',
  ];

  return order
    .map((status) => ({
      status,
      label: STATUS_LABEL[status],
      lines: transactions.filter((t) => t.status === status),
    }))
    .filter((group) => group.lines.length > 0);
}

/** Rótulo do botão de ação, por modo — some a ambiguidade de "Importar". */
export function importButtonLabel(mode: PluggyImportMode): string {
  return mode === 'replace' ? 'Apagar tudo e importar' : 'Importar e somar aos meus dados';
}
