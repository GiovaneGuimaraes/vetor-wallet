import { useCallback, useEffect, useState } from 'react';
import { getOperations, createOperation, deleteOperation } from '../api';
import { OperationForm } from '../components/OperationForm';
import { OperationsList } from '../components/OperationsList';
import { PortfolioDashboard } from '../components/PortfolioDashboard';
import { useShellContext } from '../layout/ShellContext';
import { decideWalletFlow } from './walletFlow';
import type { NewOperation, Operation } from '@vetor-wallet/shared';

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
 */
export function DashboardPage() {
  const { wallet, walletLoaded, walletLoadError, walletSummary, refreshWallet } =
    useShellContext();
  const walletFlow = decideWalletFlow(wallet, walletLoaded, walletLoadError);

  const [operations, setOperations] = useState<Operation[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [apiError, setApiError] = useState('');

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
          <OperationsList operations={operations} onDelete={handleDelete} />
        </>
      )}
    </div>
  );
}
