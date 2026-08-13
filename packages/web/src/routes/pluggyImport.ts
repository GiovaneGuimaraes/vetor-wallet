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

/**
 * Identidade da Pluggy exibida na UI (T-089f).
 *
 * O humano pediu para **não esconder** a integração: dizer de quem é a
 * tecnologia é bom para o projeto e, mais que isso, é o que faz o usuário
 * entender por que uma tela de banco vai se abrir por cima do app. Um widget de
 * instituição financeira aparecendo sem contexto é exatamente o que treina
 * alguém a desconfiar — e, no limite, a cair em phishing de verdade.
 *
 * O arquivo é a marca da Pluggy, servida de `public/`. **Não** vai para o
 * `<img>` esticado: o JPG tem fundo escuro chapado e margem interna própria,
 * então vive dentro de um selo arredondado da mesma cor, onde a margem vira
 * respiro em vez de moldura torta.
 */
export const PLUGGY_BRAND = {
  name: 'Pluggy',
  logo: '/logo-my-pluggy.jpg',
  /** Fundo do JPG — o selo usa a MESMA cor, senão aparece costura no tema claro. */
  logoBackdrop: '#150a35',
  site: 'https://pluggy.ai',
} as const;

/**
 * Frase de contexto e de segurança do fluxo de conexão.
 *
 * Precisa ser **verdadeira ao pé da letra**, não tranquilizadora: quem digita a
 * senha do banco merece saber exatamente para onde ela vai. O app de fato nunca
 * recebe credencial — o widget é da Pluggy e o que volta para nós é só o
 * `itemId` da conexão (ver `packages/pluggy-core/CLAUDE.md`).
 */
export function pluggySecurityNotes(): string[] {
  return [
    `A conexão é feita pela ${PLUGGY_BRAND.name}, provedora de Open Finance regulada pelo Banco Central.`,
    'Suas credenciais do banco são digitadas na tela da Pluggy — o Vetor Wallet nunca as recebe nem as guarda.',
    'O acesso é somente de leitura: dá para ver seus lançamentos, nunca movimentar dinheiro.',
    'Você pode desconectar quando quiser, e a conexão é revogada também do lado da Pluggy.',
  ];
}

/** Resumo curto do estado das conexões, para o cabeçalho da seção. */
export function connectionSummary(count: number): string {
  if (count === 0) return 'Nenhum banco conectado';
  return count === 1 ? '1 banco conectado' : `${count} bancos conectados`;
}

/**
 * Por que o botão de importar está travado — ou `null` quando está liberado.
 *
 * Existe porque um botão `disabled` **sem explicação** é um beco sem saída: o
 * usuário vê a ação que quer, não consegue clicar e não tem como descobrir o
 * que falta. Era o estado real de quem abria o modal sem banco conectado.
 */
export function importDisabledReason(params: {
  hasItems: boolean;
  mode: PluggyImportMode;
  confirmText: string;
}): string | null {
  if (!params.hasItems) return 'Conecte um banco para liberar a importação.';
  if (params.mode === 'replace' && !canConfirmReplace(params.confirmText)) {
    return `Digite ${REPLACE_CONFIRM_WORD} acima para confirmar que quer apagar tudo.`;
  }
  return null;
}

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
const STATUS_LABEL: Record<PluggyLineStatus, string> = {
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

/** Desfecho de uma linha do relatório — o mesmo vocabulário do core. */
export type PluggyLineStatus = PluggySyncResponse['transactions'][number]['status'];

/** Agrupa as linhas por desfecho, preservando a ordem original dentro de cada grupo. */
export function groupPluggyTransactions(
  transactions: PluggySyncResponse['transactions']
): Array<{ status: PluggyLineStatus; label: string; lines: PluggySyncResponse['transactions'] }> {
  // Ordem de exibição: o que entrou primeiro, o que precisa de atenção por
  // último — relatório de reimportação (quase todo duplicado) não deve abrir
  // com uma parede de linhas irrelevantes.
  const order: PluggyLineStatus[] = [
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

/**
 * Tom visual de cada desfecho do relatório.
 *
 * Só **três** tons para seis desfechos, de propósito: `warn` fica reservado ao
 * que pede ação do usuário (`rejected`), e tudo que é rotina — duplicada,
 * interna, pendente — cai em `muted`. Pintar movimentação interna de amarelo
 * faria um relatório saudável parecer cheio de problema, que é a mesma razão de
 * `internal` não ser `rejected` no core (T-088).
 */
export function statusTone(status: PluggyLineStatus): 'good' | 'warn' | 'muted' {
  if (status === 'imported' || status === 'previewed') return 'good';
  if (status === 'rejected') return 'warn';
  return 'muted';
}
