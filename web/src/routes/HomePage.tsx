import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FixedExpense, Goal, IncomeSource, SavingsSummary } from '@vetor-wallet/shared';
import { useShellContext } from '../layout/ShellContext';
import { getFixedExpenses, getGoals, getIncomeSources, getSavings } from '../api';
import { computeGoalsSummary, computeStockTotals, sumAmounts } from './homeMetrics';
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
  { key: 'acoes', path: '/carteiras', mascot: 'acoes-t.png', name: 'Ações', desc: 'Suas carteiras da B3' },
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
  const { walletSummaries } = useShellContext();

  const [income, setIncome] = useState<IncomeSource[]>([]);
  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  const [savingsSummary, setSavingsSummary] = useState<SavingsSummary | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [incomeRes, expensesRes, savingsRes, goalsRes] = await Promise.all([
          getIncomeSources(),
          getFixedExpenses(),
          getSavings(),
          getGoals(),
        ]);
        if (cancelled) return;
        setIncome(incomeRes);
        setExpenses(expensesRes);
        setSavingsSummary(savingsRes.summary);
        setGoals(goalsRes);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar dados da home');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stockTotals = computeStockTotals(Object.values(walletSummaries));
  const incomeTotal = sumAmounts(income);
  const expensesTotal = sumAmounts(expenses);
  const monthlyBalance = incomeTotal - expensesTotal;
  const savingsBalance = savingsSummary?.balance ?? 0;
  const goalsSummary = computeGoalsSummary(goals);
  const patrimonioTotal = stockTotals.current + savingsBalance;

  const dash = '—';

  const cardValue = (key: string): string => {
    switch (key) {
      case 'renda':
        return fmtCur.format(incomeTotal);
      case 'despesas':
        return fmtCur.format(expensesTotal);
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
              title="Cotação indisponível para uma ou mais carteiras — usando o valor investido como referência"
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
            <p className="vw-hero-metric-value">{fmtCur.format(expensesTotal)}</p>
          </div>
          <div>
            <p className="vw-hero-metric-label">Sobra do mês</p>
            <p className="vw-hero-metric-value">{fmtCur.format(monthlyBalance)}</p>
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
            <p className="vw-layer-card-value">{cardValue(card.key)}</p>
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
