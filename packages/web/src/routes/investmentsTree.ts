/**
 * T-091a — Investimentos como guarda-chuva (árvore de navegação).
 *
 * Decisão do humano (2026-08-13): o layer plano "Ações" (e o mock "Cripto")
 * viram FILHOS de um nó pai **Investimentos**. Caixinhas/CDB/Tesouro entram
 * como **Renda Fixa**, IRMÃ de Ações — não dentro dela.
 *
 * Este módulo é a ÚNICA fonte dos paths da árvore: `App.tsx` (declaração das
 * rotas e dos redirects de link antigo) e `InvestimentosPage.tsx` (o hub)
 * importam daqui. Path escrito à mão em dois lugares é como um typo em
 * `/investimentos/renda_fixa` cai no catch-all e manda o usuário para a Home
 * sem erro visível — build, lint e suíte todos verdes.
 *
 * Módulo puro (sem React, sem I/O), conforme CLAUDE.md › Convenções.
 * Fase (a) é SÓ navegação: nenhum dado, cálculo ou endpoint novo.
 */

export const INVESTMENTS_ROOT = '/investimentos';

export interface InvestmentNode {
  /** Identificador estável do nó (usado em `key` de lista e em lookups). */
  key: string;
  /** Path completo da rota, sempre sob `INVESTMENTS_ROOT`. */
  path: string;
  name: string;
  desc: string;
  /** Arquivo em `web/public/layers/`. */
  mascot: string;
  /** true = placeholder "em breve" (sem dado real ainda). */
  comingSoon: boolean;
}

/**
 * Filhos de Investimentos, na ordem em que aparecem no hub.
 *
 * `acoes` é o único com `comingSoon: false` — é a carteira B3 real, que já
 * existe desde a T-013 e cujos números não podem mudar nesta fase.
 * `renda-fixa` reusa `poupanca-t.png` **de propósito e temporariamente**: a
 * fase (a) não cria asset novo (mascote próprio fica para quando o layer
 * tiver conteúdo de verdade).
 */
export const INVESTMENT_NODES: InvestmentNode[] = [
  {
    key: 'acoes',
    path: `${INVESTMENTS_ROOT}/acoes`,
    name: 'Ações',
    desc: 'Sua carteira da B3',
    mascot: 'acoes-t.png',
    comingSoon: false,
  },
  {
    key: 'cripto',
    path: `${INVESTMENTS_ROOT}/cripto`,
    name: 'Criptomoedas',
    desc: 'Em breve',
    mascot: 'cripto-t.png',
    comingSoon: true,
  },
  {
    key: 'renda-fixa',
    path: `${INVESTMENTS_ROOT}/renda-fixa`,
    name: 'Renda Fixa',
    desc: 'Caixinhas, CDB e Tesouro',
    // Reuso intencional e temporário — ver JSDoc acima.
    mascot: 'poupanca-t.png',
    comingSoon: true,
  },
];

/**
 * Links antigos → novo path. Redirect em vez de 404, mesmo precedente da
 * T-050b (`/dash/:id` e `/carteiras` já respondiam assim) — bookmark salvo
 * não pode quebrar só porque a árvore mudou de forma.
 */
export const LEGACY_INVESTMENT_REDIRECTS: Record<string, string> = {
  '/dash': `${INVESTMENTS_ROOT}/acoes`,
  '/dash/:id': `${INVESTMENTS_ROOT}/acoes`,
  '/carteiras': `${INVESTMENTS_ROOT}/acoes`,
  '/cripto': `${INVESTMENTS_ROOT}/cripto`,
};

/** Nó da árvore pela `key`; `undefined` para chave desconhecida. */
export function investmentNodeByKey(key: string): InvestmentNode | undefined {
  return INVESTMENT_NODES.find((node) => node.key === key);
}
