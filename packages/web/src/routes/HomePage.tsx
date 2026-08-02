import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  ExpenseEntry,
  FixedExpense,
  Goal,
  IncomeEntry,
  IncomeSource,
  SavingsSummary,
} from '@vetor-wallet/shared';
import { useShellContext } from '../layout/ShellContext';
import {
  getExpenseEntries,
  getFixedExpenses,
  getGoals,
  getIncomeEntries,
  getIncomeSources,
  getSavings,
} from '../api';
import {
  computeGoalsSummary,
  computeMonthCashFlow,
  computeStockTotals,
  sumAmounts,
  isIncomeLayerEmpty,
  isExpensesLayerEmpty,
  isSavingsLayerEmpty,
  isStocksLayerEmpty,
  isGoalsLayerEmpty,
} from './homeMetrics';
import { currentMonthKey } from './expenseMonth';
import './home.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

interface LayerCardConfig {
  key: string;
  path: string;
  mascot: string;
  name: string;
  desc: string;
  chip?: string;
}

const LAYER_CARDS: LayerCardConfig[] = [
  { key: 'renda', path: '/renda', mascot: 'receitas-t.png', name: 'Renda mensal', desc: 'Fontes de receita do mês' },
  { key: 'despesas', path: '/despesas', mascot: 'despesas-t.png', name: 'Despesas', desc: 'Gastos por categoria' },
  { key: 'poupanca', path: '/poupanca', mascot: 'poupanca-t.png', name: 'Poupança', desc: 'Saldo, aportes e rendimento' },
  // T-050b: carteira única — o card vai direto ao dashboard, sem passar por
  // uma tela de seleção (`/carteiras` deixou de existir).
  { key: 'acoes', path: '/dash', mascot: 'acoes-t.png', name: 'Ações', desc: 'Sua carteira da B3' },
  { key: 'cripto', path: '/cripto', mascot: 'cripto-t.png', name: 'Criptomoedas', desc: 'Em breve', chip: 'em breve' },
  { key: 'metas', path: '/metas', mascot: 'metas-t.png', name: 'Metas', desc: 'Progresso dos seus objetivos' },
];

/**
 * Rota `/home` (T-008, evoluindo o shell entregue pela T-004): hero de
 * patrimônio (ações via ShellContext + saldo de poupança) com renda/despesas/
 * sobra do mês, e grid de cards de layer com o valor real de cada um
 * (renda, despesas, poupança, ações, metas — cripto segue mock "em breve").
 * Agregações não triviais vivem em `homeMetrics.ts` (função pura, testável
 * quando o web tiver runner — issue #6).
 */
export function HomePage() {
  const navigate = useNavigate();
  const { walletSummary } = useShellContext();

  const [income, setIncome] = useState<IncomeSource[]>([]);
  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  // null = ainda não carregado ou a busca falhou — computeMonthCashFlow cai
  // para a sobra estimada (renda − fixas) nesse caso, em vez de NaN.
  const [variableEntries, setVariableEntries] = useState<ExpenseEntry[] | null>(null);
  // T-036: rendas variáveis do mês corrente. Mesma semântica de null da linha
  // acima — computeMonthCashFlow soma 0 e sinaliza incomeEntriesLoaded=false.
  const [variableIncomeEntries, setVariableIncomeEntries] = useState<IncomeEntry[] | null>(null);
  const [savingsSummary, setSavingsSummary] = useState<SavingsSummary | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Promise.allSettled (em vez de Promise.all): se uma das chamadas
      // falhar, as demais ainda populam seus cards — só o card cuja fonte
      // falhou fica com o valor anterior (0/—) e um aviso genérico aparece.
      const [incomeRes, incomeEntriesRes, expensesRes, entriesRes, savingsRes, goalsRes] =
        await Promise.allSettled([
          getIncomeSources(),
          getIncomeEntries(currentMonthKey()),
          getFixedExpenses(),
          getExpenseEntries(currentMonthKey()),
          getSavings(),
          getGoals(),
        ]);
      if (cancelled) return;

      if (incomeRes.status === 'fulfilled') setIncome(incomeRes.value);
      if (incomeEntriesRes.status === 'fulfilled')
        setVariableIncomeEntries(incomeEntriesRes.value.entries);
      if (expensesRes.status === 'fulfilled') setExpenses(expensesRes.value);
      if (entriesRes.status === 'fulfilled') setVariableEntries(entriesRes.value.entries);
      if (savingsRes.status === 'fulfilled') setSavingsSummary(savingsRes.value.summary);
      if (goalsRes.status === 'fulfilled') setGoals(goalsRes.value);

      const failures = [
        incomeRes,
        incomeEntriesRes,
        expensesRes,
        entriesRes,
        savingsRes,
        goalsRes,
      ].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (failures.length > 0) {
        const first = failures[0].reason;
        setError(first instanceof Error ? first.message : 'Falha ao carregar alguns dados da home');
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // T-050b: `computeStockTotals` continua recebendo uma lista (assinatura
  // inalterada) — só que agora ela tem no máximo um summary, o consolidado do
  // usuário. Nenhum recálculo muda: somar um item é o mesmo que somar vários.
  const stockTotals = computeStockTotals(walletSummary ? [walletSummary] : []);
  const fixedIncomeTotal = sumAmounts(income);
  const fixedExpensesTotal = sumAmounts(expenses);
  const cashFlow = computeMonthCashFlow(
    fixedIncomeTotal,
    fixedExpensesTotal,
    variableEntries,
    variableIncomeEntries,
  );
  // Renda do mês exibida nos cards = fixas + variáveis do mês (T-036).
  const incomeTotal = cashFlow.incomeTotal;
  const savingsBalance = savingsSummary?.balance ?? 0;
  const goalsSummary = computeGoalsSummary(goals);
  const patrimonioTotal = stockTotals.current + savingsBalance;

  const dash = '—';

  // T-080: CTA curto exibido no lugar do valor quando o layer ainda não tem
  // nenhum registro (não apenas soma zero — ver predicados em homeMetrics.ts).
  // Cripto fica de fora: segue sempre "em breve" via `chip`.
  const CTA_BY_KEY: Record<string, string> = {
    renda: 'Cadastre sua renda →',
    despesas: 'Registre um gasto →',
    poupanca: 'Faça seu primeiro aporte →',
    acoes: 'Registre uma operação →',
    metas: 'Crie uma meta →',
  };

  const isLayerEmpty = (key: string): boolean => {
    switch (key) {
      case 'renda':
        return isIncomeLayerEmpty(income, variableIncomeEntries);
      case 'despesas':
        return isExpensesLayerEmpty(expenses, variableEntries);
      case 'poupanca':
        return isSavingsLayerEmpty(savingsSummary);
      case 'acoes':
        return isStocksLayerEmpty(walletSummary);
      case 'metas':
        return isGoalsLayerEmpty(goals);
      default:
        return false;
    }
  };

  const cardValue = (key: string): string => {
    switch (key) {
      case 'renda':
        return fmtCur.format(incomeTotal);
      case 'despesas':
        return fmtCur.format(cashFlow.expensesTotal);
      case 'poupanca':
        return fmtCur.format(savingsBalance);
      case 'acoes':
        return fmtCur.format(stockTotals.current);
      case 'metas':
        return goalsSummary.count === 0
          ? dash
          : goalsSummary.aggregatePct !== null
            ? `${fmtPct.format(goalsSummary.aggregatePct)}%`
            : `${goalsSummary.count}`;
      default:
        return dash;
    }
  };

  return (
    <div className="vw-home">
      <div className="vw-hero-card vw-rise" style={{ ['--vw-rise-i' as string]: 0 }}>
        <p className="vw-hero-total-label">Patrimônio total</p>
        <p className="vw-hero-total-value">
          {fmtCur.format(patrimonioTotal)}
          {stockTotals.hasMissingQuote && (
            <span
              className="vw-home-quote-flag"
              title="Cotação indisponível para um ou mais ativos — usando o valor investido como referência"
            >
              *
            </span>
          )}
        </p>
        <div className="vw-hero-metrics">
          <div>
            <p className="vw-hero-metric-label">Renda</p>
            <p className="vw-hero-metric-value">{fmtCur.format(incomeTotal)}</p>
          </div>
          <div>
            <p className="vw-hero-metric-label">Despesas</p>
            <p className="vw-hero-metric-value">{fmtCur.format(cashFlow.expensesTotal)}</p>
          </div>
          <div>
            <p className="vw-hero-metric-label">Sobra do mês</p>
            <p className="vw-hero-metric-value">{fmtCur.format(cashFlow.realBalance)}</p>
            {/* As flags de load só são avaliadas após o primeiro carregamento (!loading) — nos
                primeiros ms de qualquer carregamento variableEntries/variableIncomeEntries ainda
                são null, o que não significa falha. Sem o gate por loading, o aviso de estimativa
                piscava sempre, mesmo quando a busca ia ter sucesso (T-030). T-036: qualquer um dos
                dois lados que falhe deixa a sobra real parcial, então o aviso cobre os dois. */}
            {!loading && (!cashFlow.entriesLoaded || !cashFlow.incomeEntriesLoaded) ? (
              <p className="vw-hero-metric-sublabel vw-hero-metric-sublabel--warn">
                ⚠ Estimativa (sem lançamentos do mês)
              </p>
            ) : (
              // Sobra real === prevista quando não há lançamentos variáveis no mês (ou todos
              // somam 0): repetir o mesmo valor no sublabel é ruído, então some com a comparação.
              cashFlow.realBalance !== cashFlow.estimatedBalance && (
                <p className="vw-hero-metric-sublabel">
                  Prevista: {fmtCur.format(cashFlow.estimatedBalance)}
                </p>
              )
            )}
          </div>
        </div>
        {loading && <p className="vw-home-status">Carregando dados dos seus layers…</p>}
        {error && !loading && (
          <p className="vw-home-status vw-home-status--error">
            Alguns valores podem estar desatualizados: {error}
          </p>
        )}
      </div>

      <div className="vw-layer-grid">
        {LAYER_CARDS.map((card, i) => (
          <button
            key={card.key}
            type="button"
            className="vw-layer-card vw-rise"
            style={{ ['--vw-rise-i' as string]: i + 1 }}
            onClick={() => navigate(card.path)}
          >
            <p className="vw-layer-card-name">{card.name}</p>
            <p className="vw-layer-card-desc">{card.desc}</p>
            {!loading && !card.chip && isLayerEmpty(card.key) ? (
              <p className="vw-layer-card-value vw-layer-card-cta">{CTA_BY_KEY[card.key]}</p>
            ) : (
              <p className="vw-layer-card-value">{cardValue(card.key)}</p>
            )}
            {card.chip && <span className="vw-layer-card-chip">{card.chip}</span>}
            <img
              src={`/layers/${card.mascot}`}
              alt=""
              className="vw-layer-card-mascot"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
