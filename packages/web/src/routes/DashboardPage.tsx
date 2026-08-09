import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getOperations,
  createOperation,
  deleteOperation,
  getPortfolioHistory,
  getBenchmarkHistory,
  getSnapshots,
} from '../api';
import { OperationForm } from '../components/OperationForm';
import { OperationsList } from '../components/OperationsList';
import { PortfolioDashboard } from '../components/PortfolioDashboard';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { BackToHomeLink } from '../components/BackToHomeLink';
import { mascotSrcForLayer } from '../layout/mascots';
import { ProjectionChart } from '../components/ProjectionChart';
import { HistoryChart } from '../components/HistoryChart';
import { PriceChart } from '../components/PriceChart';
import { useShellContext } from '../layout/ShellContext';
import { decideWalletFlow } from './walletFlow';
import { buildProjectionSeries } from './chartGeometry';
import type {
  BenchmarkHistoryResponse,
  PortfolioHistoryPoint,
  QuoteSnapshot,
} from '@vetor-wallet/shared';
import { buildBenchmarkLine } from './benchmarkSeries';
import {
  deriveMonthlyReturnPct,
  parseSignedInput,
  projectPortfolio,
  resolveDefaultCurrentValue,
} from './portfolioProjection';
import { formatDecimalInput, parseMonthsInput, parseNonNegativeInput } from './savingsProjection';
import { computeAveragePrice, computeFromDate, selectDefaultTicker } from './priceChart';
import type { NewOperation, Operation } from '@vetor-wallet/shared';
import './layers.css';
import './layers-savings.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Rota `/dash` (T-004/T-013; sem `:id` desde a T-050b): dashboard de ações do
 * usuário.
 *
 * T-050b — carteira única: não há mais `useParams`, `walletId` nas chamadas de
 * API nem seleção de carteira. O escopo das operações/portfolio é o USUÁRIO
 * (o server ignora `?walletId=` desde a T-050a); a carteira vem do
 * `ShellContext` e serve só como **rótulo** (nome + cor) no topo — o chip
 * deixou de ser botão de "Trocar carteira".
 *
 * T-013 (design v4, tela 5): removidos do render os gráficos de
 * evolução/alocação/comparativo e o `BenchmarkComparison` — o serviço e a
 * rota `/api/benchmarks` do server permanecem intactos no backend, só saem
 * da UI (o front deixou de chamar `getBenchmarks()`, que não é usado por
 * nenhuma outra tela deste ciclo).
 *
 * T-026 (decisão humana "b" em TODO-HUMANO.md, 2026-07-24): removidos do
 * render `AlertsPanel` e `CsvImport` — os componentes, a lógica de
 * `utils/alerts.ts` e as rotas `/api/alerts`/`/api/import` do server
 * permanecem intactos para um redesign futuro; só saem da UI.
 *
 * T-054: o `GET /api/portfolio` deixou de ser buscado aqui — a página
 * consome `walletSummary` do `ShellContext`, o mesmo consolidado que
 * alimenta o hero da Home (`App.refreshWallet`). Antes, no primeiro load de
 * `/dash`, o shell buscava o portfolio para a Home e esta página buscava de
 * novo para o próprio dashboard — dois `GET /api/portfolio` para o mesmo
 * dado. `refreshWallet` (também do contexto) é chamado junto do `refresh`
 * local após criar/excluir uma operação, para que o hero da Home reflita a
 * mudança sem esperar a próxima navegação.
 *
 * T-056b: card "Projeção de ganhos" entre o `PortfolioDashboard` e a
 * `OperationsList` — simula juros compostos mensais sobre o valor atual da
 * carteira. Mesmo precedente client-side da T-040 (previsão de rendimento da
 * poupança): tudo em `portfolioProjection.ts` (T-056a) e nenhum endpoint
 * novo.
 *
 * T-062: o card ganhou um 4º campo, "Aporte mensal (R$)" — opcional, campo
 * vazio = sem aporte. O aporte entra tanto no `projectPortfolio` dos números
 * quanto no `buildProjectionSeries` do gráfico (mesmo argumento, mesma
 * fórmula), e os sublabels dos dois cards deixam explícito que o "ganho"
 * exclui os aportes — sem isso o número pareceria errado ao lado do valor
 * projetado.
 *
 * T-057b: o gráfico SVG (`ProjectionChart`, sem lib — ver `chartGeometry.ts`)
 * entra no MESMO card, abaixo dos dois números. `projectionSeries` reusa
 * `buildProjectionSeries` (`chartGeometry.ts`) com os MESMOS inputs já
 * validados por `projection` — o gráfico só aparece quando a projeção é
 * válida e a série reamostrada tem >= 2 pontos (`months = 0` gera 1 ponto
 * só, sem linha para desenhar). O wrapper do SVG fica fora do
 * `.vw-positions-table-wrap` (scroll horizontal da tabela de posições, mais
 * abaixo) — não tem relação com ele.
 *
 * T-058b: card "Evolução da carteira" logo ACIMA do card de projeção (entre
 * `PortfolioDashboard` e "Projeção de ganhos") — dado real antes de dado
 * simulado é a ordem de leitura mais natural, e os dois cards de gráfico
 * ficam agrupados na página em vez de intercalados com a tabela de
 * operações. Busca `GET /api/portfolio/history?days=` (T-058a) com um
 * seletor de janela (30/90/365 dias, estado local `historyDays`); o gráfico
 * (`HistoryChart`, irmão de `ProjectionChart` — ver `historyChart.ts`) só
 * aparece com `points.length >= 2`. Guarda de resposta obsoleta via
 * `historyRequestRef` (mesmo padrão de `latestRequestedMonthRef` da T-030):
 * trocar a janela rapidamente não deixa uma resposta antiga sobrescrever uma
 * mais nova que chegou primeiro. Falha de fetch mostra um aviso discreto sem
 * quebrar o resto da página (`historyError`), e a base recém-ligada (T-058a)
 * com poucos pontos ganha uma mensagem própria em vez do gráfico.
 *
 * T-060: card "Preço por ação" logo ABAIXO do "Evolução da carteira" — um
 * seletor de ticker (posições atuais, default a maior alocação via
 * `selectDefaultTicker`, `priceChart.ts`) + o MESMO padrão de seletor de
 * janela 30/90/365, mas com estado PRÓPRIO (`priceDays`), independente de
 * `historyDays`: são dois gráficos com propósitos distintos (carteira toda
 * vs. um ativo). Busca `GET /api/snapshots/:ticker?from=` (rota já existente
 * desde antes da T-058) com `from` derivado da janela
 * (`computeFromDate`) para não trafegar o histórico inteiro do ticker.
 * Trocar o TICKER ou a JANELA refaz o fetch, com a mesma guarda de resposta
 * obsoleta de `historyRequestRef` (`priceRequestRef`, cobrindo os dois
 * eixos de troca — o `useEffect` depende de ambos). `PriceChart` (irmão de
 * `HistoryChart`) desenha a linha de fechamento + a referência tracejada do
 * preço médio de compra do usuário (`computeAveragePrice`, derivado de
 * `operations` já carregadas — sem endpoint novo, mesmo precedente
 * client-side da T-040/T-056).
 *
 * T-077: `/dash` em modo consulta — no mobile (390px), "Nova Operação" era o
 * PRIMEIRO elemento da página, antes do resumo da carteira. O form agora
 * entra DEPOIS do `PortfolioDashboard` (cards + tabela de posições), atrás de
 * um `CollapsibleSection` ("+ Nova operação"), mesmo padrão da T-074
 * (DespesasPage) — consulta é o uso ~10x mais frequente que lançamento. As
 * premissas do simulador de "Projeção de ganhos" (valor/taxa/prazo/aporte)
 * também ganham o mesmo tratamento ("Ajustar premissas"): o valor atual já
 * vem pré-preenchido (`defaultCurrentValue`), então os 4 inputs ficam atrás
 * do toggle (recolhido por padrão) enquanto o RESULTADO da projeção
 * (`projection`/`ProjectionChart`, fora do `CollapsibleSection`) continua
 * visível direto — a simulação default já roda sem exigir que o usuário
 * abra a seção primeiro.
 */
const HISTORY_WINDOW_OPTIONS = [30, 90, 365] as const;
const DEFAULT_HISTORY_DAYS = 90;
export function DashboardPage() {
  const { wallet, walletLoaded, walletLoadError, walletSummary, refreshWallet } = useShellContext();
  const walletFlow = decideWalletFlow(wallet, walletLoaded, walletLoadError);

  const [operations, setOperations] = useState<Operation[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [apiError, setApiError] = useState('');

  // Evolução da carteira (T-058b): série real de GET /api/portfolio/history,
  // com seletor de janela (30/90/365 dias). `historyRequestRef` guarda o
  // pedido em voo mais recente — trocar a janela rápido não deixa uma
  // resposta obsoleta sobrescrever a mais nova (mesmo padrão de
  // `latestRequestedMonthRef` da T-030).
  const [historyDays, setHistoryDays] = useState<number>(DEFAULT_HISTORY_DAYS);
  const [historyPoints, setHistoryPoints] = useState<PortfolioHistoryPoint[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const historyRequestRef = useRef(0);

  const hasPositions = walletSummary !== null && walletSummary.positions.length > 0;

  const refreshHistory = useCallback(async (days: number) => {
    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await getPortfolioHistory(days);
      if (historyRequestRef.current !== requestId) return;
      setHistoryPoints(res.points);
    } catch (err) {
      if (historyRequestRef.current !== requestId) return;
      setHistoryError(
        err instanceof Error ? err.message : 'Erro ao buscar o histórico da carteira'
      );
    } finally {
      if (historyRequestRef.current === requestId) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasPositions) return;
    void refreshHistory(historyDays);
  }, [hasPositions, historyDays, refreshHistory]);

  // Comparação com CDI/Ibovespa (T-068): séries da MESMA janela, buscadas em
  // paralelo ao histórico e com a mesma guarda de resposta obsoleta. Ligar/
  // desligar uma série é só render (`showCdi`/`showIbov`) — não refaz fetch,
  // porque a resposta traz as duas de uma vez. Uma falha aqui é SILENCIOSA no
  // lugar do gráfico e só aparece como aviso discreto: a comparação é um
  // extra, o gráfico da carteira continua correto sem ela.
  const [benchmarkSeries, setBenchmarkSeries] = useState<BenchmarkHistoryResponse | null>(null);
  const [benchmarkError, setBenchmarkError] = useState('');
  const [showCdi, setShowCdi] = useState(false);
  const [showIbov, setShowIbov] = useState(false);
  const benchmarkRequestRef = useRef(0);

  useEffect(() => {
    if (!hasPositions) return;
    if (!showCdi && !showIbov) return;
    const requestId = ++benchmarkRequestRef.current;
    setBenchmarkError('');
    void (async () => {
      try {
        const res = await getBenchmarkHistory(historyDays);
        if (benchmarkRequestRef.current !== requestId) return;
        setBenchmarkSeries(res);
      } catch (err) {
        if (benchmarkRequestRef.current !== requestId) return;
        setBenchmarkSeries(null);
        setBenchmarkError(err instanceof Error ? err.message : 'Erro ao buscar os benchmarks');
      }
    })();
  }, [hasPositions, historyDays, showCdi, showIbov]);

  const cdiLine = useMemo(
    () =>
      showCdi && historyPoints ? buildBenchmarkLine(benchmarkSeries?.cdi, historyPoints) : null,
    [showCdi, benchmarkSeries, historyPoints]
  );
  const ibovLine = useMemo(
    () =>
      showIbov && historyPoints
        ? buildBenchmarkLine(benchmarkSeries?.ibovespa, historyPoints)
        : null,
    [showIbov, benchmarkSeries, historyPoints]
  );
  // Pedida mas indisponível (fonte externa sem dado no período): avisa em vez
  // de deixar o usuário achar que o toggle não funcionou.
  const benchmarkUnavailable =
    (showCdi && benchmarkSeries !== null && cdiLine === null) ||
    (showIbov && benchmarkSeries !== null && ibovLine === null);

  // Preço por ação (T-060): seletor de ticker + janela PRÓPRIA (independente
  // de `historyDays`). `priceTicker` default é a maior alocação
  // (`selectDefaultTicker`); some das posições atuais (venda total) faz o
  // efeito recair no novo default em vez de manter um ticker fantasma.
  const [priceTicker, setPriceTicker] = useState<string | null>(null);
  const [priceDays, setPriceDays] = useState<number>(DEFAULT_HISTORY_DAYS);
  const [priceSnapshots, setPriceSnapshots] = useState<QuoteSnapshot[] | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const priceRequestRef = useRef(0);

  useEffect(() => {
    if (!walletSummary) return;
    setPriceTicker((prev) => {
      if (prev && walletSummary.positions.some((p) => p.ticker === prev)) return prev;
      return selectDefaultTicker(walletSummary.positions);
    });
  }, [walletSummary]);

  const refreshPrice = useCallback(async (ticker: string, days: number) => {
    const requestId = ++priceRequestRef.current;
    setPriceLoading(true);
    setPriceError('');
    try {
      const from = computeFromDate(days);
      const snapshots = await getSnapshots(ticker, from);
      if (priceRequestRef.current !== requestId) return;
      setPriceSnapshots(snapshots);
    } catch (err) {
      if (priceRequestRef.current !== requestId) return;
      setPriceError(err instanceof Error ? err.message : 'Erro ao buscar o histórico de preço');
    } finally {
      if (priceRequestRef.current === requestId) setPriceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!priceTicker) {
      setPriceSnapshots(null);
      return;
    }
    void refreshPrice(priceTicker, priceDays);
  }, [priceTicker, priceDays, refreshPrice]);

  const priceAveragePrice = useMemo(
    () => (priceTicker ? computeAveragePrice(operations, priceTicker) : null),
    [operations, priceTicker]
  );

  // Simulador de projeção de ganhos (T-056b) — 100% client-side, mesmo padrão
  // `simTouched` da T-040: os defaults (valor atual da carteira, taxa
  // derivada do P&L realizado) só sobrescrevem o campo enquanto o usuário
  // ainda não digitou nele, para que um refetch de `walletSummary` não
  // atropele o que foi digitado.
  const [simCurrentValue, setSimCurrentValue] = useState('');
  const [simRatePct, setSimRatePct] = useState('');
  const [simMonths, setSimMonths] = useState('12');
  // T-062: aporte mensal recorrente, opcional. Nasce vazio (= sem aporte) e
  // NÃO entra no `simTouched` — não há default derivado para ele sobrescrever.
  const [simContribution, setSimContribution] = useState('');
  const [simTouched, setSimTouched] = useState({ currentValue: false, ratePct: false });

  const defaultCurrentValue = useMemo(
    () => resolveDefaultCurrentValue(walletSummary),
    [walletSummary]
  );
  const derivedRatePct = useMemo(
    () => (walletSummary ? deriveMonthlyReturnPct(operations, walletSummary) : null),
    [operations, walletSummary]
  );

  useEffect(() => {
    if (simTouched.currentValue) return;
    setSimCurrentValue(formatDecimalInput(defaultCurrentValue.value, 2));
  }, [defaultCurrentValue, simTouched.currentValue]);

  useEffect(() => {
    if (simTouched.ratePct) return;
    setSimRatePct(derivedRatePct !== null ? formatDecimalInput(derivedRatePct, 4) : '');
  }, [derivedRatePct, simTouched.ratePct]);

  const parsedCurrentValue = parseNonNegativeInput(simCurrentValue);
  const parsedRatePct = parseSignedInput(simRatePct);
  const parsedMonths = parseMonthsInput(simMonths);
  // T-062: campo de aporte VAZIO significa "sem aporte" (0), não entrada
  // inválida — `parseNonNegativeInput` devolveria `null` nos dois casos.
  // Aporte é sempre ≥ 0 (só a TAXA aceita sinal nesta tela).
  const trimmedContribution = simContribution.trim();
  const parsedContribution =
    trimmedContribution === '' ? 0 : parseNonNegativeInput(trimmedContribution);
  const projection =
    parsedCurrentValue !== null &&
    parsedRatePct !== null &&
    parsedMonths !== null &&
    parsedContribution !== null
      ? projectPortfolio(parsedCurrentValue, parsedRatePct, parsedMonths, parsedContribution)
      : null;

  // T-057b: a mesma série que o SVG desenha. Só computada quando a projeção
  // já é válida (parsedCurrentValue/parsedRatePct/parsedMonths garantidos
  // não-nulos aqui) — evita recalcular a série reamostrada em toda digitação
  // inválida.
  const projectionSeries =
    projection &&
    parsedCurrentValue !== null &&
    parsedRatePct !== null &&
    parsedMonths !== null &&
    parsedContribution !== null
      ? buildProjectionSeries(parsedCurrentValue, parsedRatePct, parsedMonths, parsedContribution)
      : [];

  const refresh = useCallback(async () => {
    setApiError('');
    try {
      setOperations(await getOperations());
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Erro ao conectar com a API');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    setLoadingData(true);
    refresh();
  }, [refresh]);

  async function handleCreate(op: NewOperation) {
    await createOperation(op);
    await Promise.all([refresh(), refreshWallet(), refreshHistory(historyDays)]);
  }

  async function handleDelete(opId: number) {
    await deleteOperation(opId);
    await Promise.all([refresh(), refreshWallet(), refreshHistory(historyDays)]);
  }

  return (
    <div className="flex flex-col gap-5">
      <BackToHomeLink />
      <div className="flex items-center gap-3">
        {/* Rótulo estático (T-050b): identifica a carteira, não é mais um
            botão — não há para onde trocar. As operações abaixo são do
            usuário, independentemente do que este rótulo mostra. */}
        <span className="flex items-center gap-1.5 bg-raised border border-edge rounded-full px-3 py-1 text-xs text-ink min-w-0">
          {wallet && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: wallet.color }}
            />
          )}
          <span className="truncate max-w-[200px]">
            {walletFlow === 'ready' && wallet
              ? wallet.name
              : walletFlow === 'create'
                ? 'Preparando sua carteira…'
                : walletFlow === 'error'
                  ? 'Carteira indisponível'
                  : 'Carteira'}
          </span>
        </span>
        {/* T-027: falha ao carregar a carteira nunca vira criação automática —
            o usuário decide tentar de novo. O resto do dashboard continua
            renderizando: operações e portfolio não dependem deste rótulo. */}
        {walletFlow === 'error' && (
          <button
            type="button"
            onClick={() => {
              void refreshWallet();
            }}
            className="text-xs text-dim hover:text-ink underline cursor-pointer"
          >
            Tentar novamente
          </button>
        )}
        {/* T-020: mascote decorativo da layer de Ações — mesmo mecanismo de
            breakpoint das demais pages (`.vw-page-mascot`, some <=480px em
            vez de encolher); só a posição é diferente aqui (na pill da
            carteira, via `ml-auto`), porque esta page não tem `<h1>`. */}
        <img
          src={mascotSrcForLayer('dash')}
          alt=""
          className="vw-page-mascot ml-auto"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      </div>

      {apiError && (
        <div className="bg-down/10 border border-down/30 text-down rounded-lg px-4 py-3 text-sm">
          {apiError} — verifique se o servidor está rodando em{' '}
          <code className="font-mono text-xs bg-down/10 px-1.5 py-0.5 rounded">
            http://localhost:3001
          </code>
        </div>
      )}

      {/* T-054: `walletLoaded` (contexto) cobre o carregamento do portfolio
          consolidado, que a página não busca mais sozinha — combinado com o
          `loadingData` local (só das operações) para não renderizar o
          dashboard "pela metade" enquanto qualquer um dos dois ainda está em
          voo no primeiro load. */}
      {loadingData || !walletLoaded ? (
        <div className="text-center py-16 text-dim text-sm">Carregando...</div>
      ) : (
        <>
          <PortfolioDashboard summary={walletSummary} walletColor={wallet?.color} />

          {/* T-077: "Nova operação" passa a vir DEPOIS do resumo (cards +
              tabela de posições), recolhida por padrão — no mobile (390px) o
              form era o primeiro elemento da página, antes de qualquer
              consulta. Mesmo padrão `CollapsibleSection` da T-074
              (DespesasPage): consulta é o uso ~10x mais frequente que
              lançamento. */}
          <CollapsibleSection label="Nova operação" openLabel="Nova operação">
            <OperationForm onSubmit={handleCreate} />
          </CollapsibleSection>

          {/*
            Evolução da carteira (T-058b): oculto sem posições, mesmo guard do
            card de projeção abaixo — o estado vazio do PortfolioDashboard já
            cobre "adicione operações".
          */}
          {hasPositions && (
            <div className="vw-form-card">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="vw-form-title">Evolução da carteira</p>
                {/* Comparativo (T-068): dois toggles independentes — cada
                    linha mostra quanto o MESMO dinheiro do primeiro dia da
                    janela valeria no benchmark. */}
                <div
                  className="vw-history-window"
                  role="group"
                  aria-label="Comparar com benchmarks"
                >
                  <button
                    type="button"
                    aria-pressed={showCdi}
                    onClick={() => setShowCdi((v) => !v)}
                    className={`vw-history-window-btn ${
                      showCdi ? 'vw-history-window-btn--active' : ''
                    }`}
                  >
                    <span
                      className="vw-bench-toggle-dot"
                      style={{ color: 'var(--color-bench-cdi)' }}
                      aria-hidden="true"
                    />
                    CDI
                  </button>
                  <button
                    type="button"
                    aria-pressed={showIbov}
                    onClick={() => setShowIbov((v) => !v)}
                    className={`vw-history-window-btn ${
                      showIbov ? 'vw-history-window-btn--active' : ''
                    }`}
                  >
                    <span
                      className="vw-bench-toggle-dot"
                      style={{ color: 'var(--color-bench-ibov)' }}
                      aria-hidden="true"
                    />
                    Ibovespa
                  </button>
                </div>
                <div className="vw-history-window" role="group" aria-label="Janela do histórico">
                  {HISTORY_WINDOW_OPTIONS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      disabled={historyLoading && historyDays === days}
                      onClick={() => setHistoryDays(days)}
                      className={`vw-history-window-btn ${
                        historyDays === days ? 'vw-history-window-btn--active' : ''
                      }`}
                    >
                      {days === 365 ? '1a' : `${days}d`}
                    </button>
                  ))}
                </div>
              </div>

              {historyError && (
                <p className="vw-field-hint vw-field-hint--warn">
                  {historyError} — o restante do dashboard continua disponível.
                </p>
              )}

              {!historyError && historyPoints === null && historyLoading && (
                <p className="vw-field-hint">Carregando histórico…</p>
              )}

              {!historyError && historyPoints !== null && historyPoints.length < 2 && (
                <p className="vw-field-hint">
                  O histórico da carteira começa a ser coletado a partir de agora — volte em alguns
                  dias.
                </p>
              )}

              {benchmarkError && (
                <p className="vw-field-hint vw-field-hint--warn">
                  {benchmarkError} — o gráfico da carteira continua disponível.
                </p>
              )}

              {!benchmarkError && benchmarkUnavailable && (
                <p className="vw-field-hint">
                  Sem dados de benchmark para este período — tente uma janela maior.
                </p>
              )}

              {!historyError && historyPoints !== null && historyPoints.length >= 2 && (
                <div className="vw-history-chart-wrap">
                  <HistoryChart points={historyPoints} cdiLine={cdiLine} ibovLine={ibovLine} />
                </div>
              )}
            </div>
          )}

          {/*
            Preço por ação (T-060): oculto sem posições, mesmo guard dos
            outros cards de gráfico — sem ticker nenhum para selecionar.
          */}
          {hasPositions && walletSummary && priceTicker && (
            <div className="vw-form-card">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="vw-form-title">Preço por ação</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="vw-layerpage-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="price-ticker" className="sr-only">
                      Ativo
                    </label>
                    <select
                      id="price-ticker"
                      value={priceTicker}
                      onChange={(e) => setPriceTicker(e.target.value)}
                    >
                      {walletSummary.positions.map((p) => (
                        <option key={p.ticker} value={p.ticker}>
                          {p.ticker}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div
                    className="vw-history-window"
                    role="group"
                    aria-label="Janela do gráfico de preço"
                  >
                    {HISTORY_WINDOW_OPTIONS.map((days) => (
                      <button
                        key={days}
                        type="button"
                        disabled={priceLoading && priceDays === days}
                        onClick={() => setPriceDays(days)}
                        className={`vw-history-window-btn ${
                          priceDays === days ? 'vw-history-window-btn--active' : ''
                        }`}
                      >
                        {days === 365 ? '1a' : `${days}d`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {priceError && (
                <p className="vw-field-hint vw-field-hint--warn">
                  {priceError} — o restante do dashboard continua disponível.
                </p>
              )}

              {!priceError && priceSnapshots === null && priceLoading && (
                <p className="vw-field-hint">Carregando histórico de preço…</p>
              )}

              {!priceError && priceSnapshots !== null && priceSnapshots.length < 2 && (
                <p className="vw-field-hint">
                  O histórico de preços deste ativo começa a ser coletado a partir de agora.
                </p>
              )}

              {!priceError && priceSnapshots !== null && priceSnapshots.length >= 2 && (
                <div className="vw-history-chart-wrap">
                  <PriceChart snapshots={priceSnapshots} averagePrice={priceAveragePrice} />
                </div>
              )}
            </div>
          )}

          {/*
            Projeção de ganhos (T-056b): oculto sem posições — o estado vazio
            do PortfolioDashboard acima já cobre "adicione operações", e uma
            simulação sobre valor atual 0 não agrega nada.
          */}
          {walletSummary && walletSummary.positions.length > 0 && (
            <div className="vw-form-card">
              <p className="vw-form-title">Projeção de ganhos</p>

              {/* T-077: premissas (valor atual/taxa/prazo/aporte) atrás de
                  "ajustar" — o valor atual já vem pré-preenchido pelo
                  `defaultCurrentValue`, então a consulta (resultado da
                  projeção) pode aparecer sem exigir que o usuário abra o
                  formulário primeiro. */}
              <CollapsibleSection label="Ajustar premissas" openLabel="Ajustar premissas">
                <div className="vw-form-grid">
                  <div className="vw-layerpage-field">
                    <label htmlFor="sim-current-value">Valor atual (R$)</label>
                    <input
                      id="sim-current-value"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={simCurrentValue}
                      onChange={(e) => {
                        setSimTouched((prev) => ({ ...prev, currentValue: true }));
                        setSimCurrentValue(e.target.value);
                      }}
                    />
                    {defaultCurrentValue.usedFallback && !simTouched.currentValue && (
                      <span className="vw-field-hint vw-field-hint--warn">
                        Cotações indisponíveis agora — usando o valor investido como estimativa.
                      </span>
                    )}
                  </div>
                  <div className="vw-layerpage-field">
                    <label htmlFor="sim-return-rate">Retorno mensal (%)</label>
                    <input
                      id="sim-return-rate"
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex.: 0,8"
                      value={simRatePct}
                      onChange={(e) => {
                        setSimTouched((prev) => ({ ...prev, ratePct: true }));
                        setSimRatePct(e.target.value);
                      }}
                    />
                  </div>
                  <div className="vw-layerpage-field">
                    <label htmlFor="sim-months">Prazo (meses)</label>
                    <input
                      id="sim-months"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="12"
                      value={simMonths}
                      onChange={(e) => setSimMonths(e.target.value)}
                    />
                  </div>
                  <div className="vw-layerpage-field">
                    <label htmlFor="sim-contribution">Aporte mensal (R$)</label>
                    <input
                      id="sim-contribution"
                      type="text"
                      inputMode="decimal"
                      placeholder="Opcional"
                      value={simContribution}
                      onChange={(e) => setSimContribution(e.target.value)}
                    />
                  </div>
                </div>

                <span className="vw-field-hint">
                  {derivedRatePct !== null
                    ? 'Taxa sugerida a partir do retorno realizado da sua carteira — ajuste à vontade. '
                    : 'Sem histórico suficiente para sugerir uma taxa — informe o retorno mensal esperado. '}
                  Simulação sobre o valor atual da carteira — não é previsão.
                </span>
              </CollapsibleSection>

              {projection ? (
                <div className="vw-savings-projection">
                  <div className="vw-savings-summary-card">
                    <p className="vw-savings-summary-label">Valor projetado</p>
                    <p className="vw-savings-summary-value">
                      {fmtCur.format(projection.futureValue)}
                    </p>
                    {projection.totalContributed > 0 && (
                      <p className="vw-savings-summary-sub">
                        Inclui {fmtCur.format(projection.totalContributed)} aportados no período.
                      </p>
                    )}
                  </div>
                  <div className="vw-savings-summary-card">
                    <p className="vw-savings-summary-label">
                      Ganho em {parsedMonths} {parsedMonths === 1 ? 'mês' : 'meses'}
                    </p>
                    <p
                      className={`vw-savings-summary-value ${
                        projection.totalGain >= 0 ? 'vw-value-up' : 'vw-value-down'
                      }`}
                    >
                      {fmtCur.format(projection.totalGain)}
                    </p>
                    {/* T-062: o ganho EXCLUI os aportes — sem dizer isso, o
                        número parece errado ao lado do valor projetado. */}
                    {projection.totalContributed > 0 && (
                      <p className="vw-savings-summary-sub">
                        Só a valorização — os {fmtCur.format(projection.totalContributed)} aportados
                        não contam como ganho.
                      </p>
                    )}
                  </div>
                  {/* T-057b: só entra quando a projeção é válida E a série
                      reamostrada tem >= 2 pontos — `months = 0` produz um
                      único ponto (mês 0), sem variação nenhuma para
                      desenhar uma linha; os hints de entrada inválida acima
                      já cobrem os demais casos em que a série vem vazia. */}
                  {projectionSeries.length >= 2 && (
                    <div className="vw-projection-chart-wrap">
                      <ProjectionChart series={projectionSeries} />
                    </div>
                  )}
                </div>
              ) : (
                <p className="vw-field-hint vw-field-hint--warn">
                  Informe valor atual (≥ 0), retorno mensal (maior que -100%), prazo em meses
                  inteiro e aporte mensal (≥ 0, opcional) para ver a projeção.
                </p>
              )}
            </div>
          )}

          <OperationsList operations={operations} onDelete={handleDelete} />
        </>
      )}
    </div>
  );
}
