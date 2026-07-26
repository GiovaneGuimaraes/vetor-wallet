import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOperations, createOperation, deleteOperation } from '../api';
import { OperationForm } from '../components/OperationForm';
import { OperationsList } from '../components/OperationsList';
import { PortfolioDashboard } from '../components/PortfolioDashboard';
import { useShellContext } from '../layout/ShellContext';
import { decideWalletFlow } from './walletFlow';
import {
  deriveMonthlyReturnPct,
  parseSignedInput,
  projectPortfolio,
  resolveDefaultCurrentValue,
} from './portfolioProjection';
import {
  formatDecimalInput,
  parseMonthsInput,
  parseNonNegativeInput,
} from './savingsProjection';
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
 * novo. O gráfico SVG do resultado é a T-057b, que entra no MESMO card (ver
 * ponto de inserção marcado abaixo) — este card não desenha nada além dos
 * dois números hoje.
 */
export function DashboardPage() {
  const { wallet, walletLoaded, walletLoadError, walletSummary, refreshWallet } =
    useShellContext();
  const walletFlow = decideWalletFlow(wallet, walletLoaded, walletLoadError);

  const [operations, setOperations] = useState<Operation[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [apiError, setApiError] = useState('');

  // Simulador de projeção de ganhos (T-056b) — 100% client-side, mesmo padrão
  // `simTouched` da T-040: os defaults (valor atual da carteira, taxa
  // derivada do P&L realizado) só sobrescrevem o campo enquanto o usuário
  // ainda não digitou nele, para que um refetch de `walletSummary` não
  // atropele o que foi digitado.
  const [simCurrentValue, setSimCurrentValue] = useState('');
  const [simRatePct, setSimRatePct] = useState('');
  const [simMonths, setSimMonths] = useState('12');
  const [simTouched, setSimTouched] = useState({ currentValue: false, ratePct: false });

  const defaultCurrentValue = useMemo(
    () => resolveDefaultCurrentValue(walletSummary),
    [walletSummary],
  );
  const derivedRatePct = useMemo(
    () => (walletSummary ? deriveMonthlyReturnPct(operations, walletSummary) : null),
    [operations, walletSummary],
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
  const projection =
    parsedCurrentValue !== null && parsedRatePct !== null && parsedMonths !== null
      ? projectPortfolio(parsedCurrentValue, parsedRatePct, parsedMonths)
      : null;

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
    await Promise.all([refresh(), refreshWallet()]);
  }

  async function handleDelete(opId: number) {
    await deleteOperation(opId);
    await Promise.all([refresh(), refreshWallet()]);
  }

  return (
    <div className="flex flex-col gap-5">
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
            onClick={() => { void refreshWallet(); }}
            className="text-xs text-dim hover:text-ink underline cursor-pointer"
          >
            Tentar novamente
          </button>
        )}
      </div>

      {apiError && (
        <div className="bg-down/10 border border-down/30 text-down rounded-lg px-4 py-3 text-sm">
          {apiError} — verifique se o servidor está rodando em{' '}
          <code className="font-mono text-xs bg-down/10 px-1.5 py-0.5 rounded">
            http://localhost:3001
          </code>
        </div>
      )}

      <OperationForm onSubmit={handleCreate} />

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

          {/*
            Projeção de ganhos (T-056b): oculto sem posições — o estado vazio
            do PortfolioDashboard acima já cobre "adicione operações", e uma
            simulação sobre valor atual 0 não agrega nada.
          */}
          {walletSummary && walletSummary.positions.length > 0 && (
            <div className="vw-form-card">
              <p className="vw-form-title">Projeção de ganhos</p>
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
              </div>

              <span className="vw-field-hint">
                {derivedRatePct !== null
                  ? 'Taxa sugerida a partir do retorno realizado da sua carteira — ajuste à vontade. '
                  : 'Sem histórico suficiente para sugerir uma taxa — informe o retorno mensal esperado. '}
                Simulação sobre o valor atual da carteira — não é previsão.
              </span>

              {projection ? (
                <div className="vw-savings-projection">
                  <div className="vw-savings-summary-card">
                    <p className="vw-savings-summary-label">Valor projetado</p>
                    <p className="vw-savings-summary-value">{fmtCur.format(projection.futureValue)}</p>
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
                  </div>
                  {/* Ponto de inserção do gráfico SVG (T-057b), no mesmo card. */}
                </div>
              ) : (
                <p className="vw-field-hint vw-field-hint--warn">
                  Informe valor atual (≥ 0), retorno mensal (maior que -100%) e prazo em meses
                  inteiro para ver a projeção.
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
