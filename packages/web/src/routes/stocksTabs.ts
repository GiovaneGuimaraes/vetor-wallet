/**
 * Abas de `/investimentos/acoes`. A aba ativa vive na query string (`?aba=`),
 * para sobreviver a recarregar/compartilhar e ao botão Voltar. "Carteira" é o
 * padrão e fica sem parâmetro (URL limpa). Nova aba (lista de acompanhamento,
 * descoberta…) = uma entrada aqui + um `TabPanel` na página.
 */
export type StocksTab = 'carteira' | 'mercado' | 'operacoes';

export const STOCKS_TABS: { key: StocksTab; label: string }[] = [
  { key: 'carteira', label: 'Carteira' },
  { key: 'mercado', label: 'Mercado' },
  { key: 'operacoes', label: 'Operações' },
];

export const DEFAULT_STOCKS_TAB: StocksTab = 'carteira';

export function parseStocksTab(raw: string | null): StocksTab {
  return STOCKS_TABS.find((t) => t.key === raw)?.key ?? DEFAULT_STOCKS_TAB;
}
