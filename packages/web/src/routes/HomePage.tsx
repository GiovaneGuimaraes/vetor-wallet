import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  ExpenseEntry,
  FixedExpense,
  IncomeEntry,
  IncomeSource,
  PluggyItemView,
  SavingsSummary,
} from '@vetor-wallet/shared';
import { useShellContext } from '../layout/ShellContext';
import {
  getExpenseEntries,
  getFixedExpenses,
  getIncomeEntries,
  getIncomeSources,
  getPluggyStatus,
  getSavings,
} from '../api';
import { PluggyImportModal } from '../components/PluggyImportModal';
import { PLUGGY_BRAND, connectionSummary } from './pluggyImport';
import '../components/pluggyImport.css';
import {
  computeMonthCashFlow,
  computeStockTotals,
  sumAmounts,
  isIncomeLayerEmpty,
  isExpensesLayerEmpty,
  isSavingsLayerEmpty,
  isStocksLayerEmpty,
} from './homeMetrics';
import { currentMonthKey } from './expenseMonth';
import { INVESTMENTS_ROOT } from './investmentsTree';
import './home.css';

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

interface LayerCardConfig {
  key: string;
  path: string;
  mascot: string;
  name: string;
  desc: string;
  chip?: string;
}

const LAYER_CARDS: LayerCardConfig[] = [
  {
    key: 'renda',
    path: '/renda',
    mascot: 'receitas-t.png',
    name: 'Renda mensal',
    desc: 'Fontes de receita do mês',
  },
  {
    key: 'despesas',
    path: '/despesas',
    mascot: 'despesas-t.png',
    name: 'Despesas',
    desc: 'Gastos por categoria',
  },
  {
    key: 'poupanca',
    path: '/poupanca',
    mascot: 'poupanca-t.png',
    name: 'Poupança',
    desc: 'Saldo, aportes e rendimento',
  },
  // T-091a: os cards "Ações" e "Criptomoedas" fundiram-se neste — Investimentos
  // é o guarda-chuva (Ações, Cripto e Renda Fixa vivem no hub `/investimentos`).
  // O VALOR continua sendo o da carteira B3 (`stockTotals.current`), o mesmo de
  // antes: cripto e renda fixa ainda não têm dado nenhum para somar.
  {
    key: 'investimentos',
    path: INVESTMENTS_ROOT,
    mascot: 'acoes-t.png',
    name: 'Investimentos',
    desc: 'Ações, cripto e renda fixa',
  },
];

// T-080: CTA curto exibido no lugar do valor quando o layer ainda não tem
// nenhum registro (não apenas soma zero — ver predicados em homeMetrics.ts).
// Estático — vive fora do componente para não ser recriado a cada render.
// T-091a: as chaves aqui, em `isLayerEmpty` e em `cardValue` são as MESMAS de
// `LAYER_CARDS`; renomear um card sem atualizar os três faz o cartão cair no
// `default` e mostrar "—" para sempre, com build, lint e suíte verdes.
const CTA_BY_KEY: Record<string, string> = {
  renda: 'Cadastre sua renda →',
  despesas: 'Registre um gasto →',
  poupanca: 'Faça seu primeiro aporte →',
  investimentos: 'Registre uma operação →',
};

/**
 * Rota `/home` (T-008, evoluindo o shell entregue pela T-004): hero de
 * patrimônio (ações via ShellContext + saldo de poupança) com renda/despesas/
 * sobra do mês, e grid de cards de layer com o valor real de cada um
 * (renda, despesas, poupança, investimentos). T-091a: "Ações" e
 * "Criptomoedas" saíram daqui e viraram filhos do card "Investimentos", que
 * leva ao hub `/investimentos`. T-091b1: o card "Metas" saiu — o conceito de
 * meta deixou de existir no app (decisão do humano).
 * Agregações não triviais vivem em `homeMetrics.ts` (função pura, testável
 * quando o web tiver runner — issue #6).
 */
export function HomePage() {
  const navigate = useNavigate();
  const { walletSummary, walletLoaded, walletLoadError } = useShellContext();

  const [income, setIncome] = useState<IncomeSource[]>([]);
  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  // null = ainda não carregado ou a busca falhou — computeMonthCashFlow cai
  // para a sobra estimada (renda − fixas) nesse caso, em vez de NaN.
  const [variableEntries, setVariableEntries] = useState<ExpenseEntry[] | null>(null);
  // T-036: rendas variáveis do mês corrente. Mesma semântica de null da linha
  // acima — computeMonthCashFlow soma 0 e sinaliza incomeEntriesLoaded=false.
  const [variableIncomeEntries, setVariableIncomeEntries] = useState<IncomeEntry[] | null>(null);
  const [savingsSummary, setSavingsSummary] = useState<SavingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // T-089c — o botão de importar só aparece quando o SERVER diz que a integração
  // está ligada (gate `ENVIRONMENT`). O web nunca lê uma cópia da flag em
  // `VITE_*`: duas cópias divergem e a do cliente é burlável.
  const [pluggyEnabled, setPluggyEnabled] = useState(false);
  const [pluggyItems, setPluggyItems] = useState<PluggyItemView[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refreshPluggy = useCallback(async () => {
    try {
      const status = await getPluggyStatus();
      setPluggyEnabled(status.enabled);
      setPluggyItems(status.items);
    } catch {
      // Integração indisponível não é erro da Home: o botão simplesmente não
      // aparece, e os cards seguem funcionando.
      setPluggyEnabled(false);
    }
  }, []);

  useEffect(() => {
    refreshPluggy();
  }, [refreshPluggy]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Promise.allSettled (em vez de Promise.all): se uma das chamadas
      // falhar, as demais ainda populam seus cards — só o card cuja fonte
      // falhou fica com o valor anterior (0/—) e um aviso genérico aparece.
      const [incomeRes, incomeEntriesRes, expensesRes, entriesRes, savingsRes] =
        await Promise.allSettled([
          getIncomeSources(),
          getIncomeEntries(currentMonthKey()),
          getFixedExpenses(),
          getExpenseEntries(currentMonthKey()),
          getSavings(),
        ]);
      if (cancelled) return;

      if (incomeRes.status === 'fulfilled') setIncome(incomeRes.value);
      if (incomeEntriesRes.status === 'fulfilled')
        setVariableIncomeEntries(incomeEntriesRes.value.entries);
      if (expensesRes.status === 'fulfilled') setExpenses(expensesRes.value);
      if (entriesRes.status === 'fulfilled') setVariableEntries(entriesRes.value.entries);
      if (savingsRes.status === 'fulfilled') setSavingsSummary(savingsRes.value.summary);

      const failures = [incomeRes, incomeEntriesRes, expensesRes, entriesRes, savingsRes].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
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
    // `reloadKey` muda depois de uma importação da Pluggy (T-089c): ela pode ter
    // escrito em qualquer mês e, no modo replace, apagado tudo — os totais da
    // Home precisam ser buscados de novo, não remendados no cliente.
  }, [reloadKey]);

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
    variableIncomeEntries
  );
  // Renda do mês exibida nos cards = fixas + variáveis do mês (T-036).
  const incomeTotal = cashFlow.incomeTotal;
  const savingsBalance = savingsSummary?.balance ?? 0;
  const patrimonioTotal = stockTotals.current + savingsBalance;

  const dash = '—';

  const isLayerEmpty = (key: string): boolean => {
    switch (key) {
      case 'renda':
        return isIncomeLayerEmpty(income, variableIncomeEntries);
      case 'despesas':
        return isExpensesLayerEmpty(expenses, variableEntries);
      case 'poupanca':
        return isSavingsLayerEmpty(savingsSummary);
      case 'investimentos':
        return isStocksLayerEmpty(walletSummary, walletLoaded, walletLoadError);
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
      case 'investimentos':
        return fmtCur.format(stockTotals.current);
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
        {/* T-089c — o botão fica no card do patrimônio porque a importação
            alimenta justamente os números daqui, e não de um layer só. Só
            aparece com a integração ligada no server.
            T-089f — deixou de ser uma pílula anônima: mostra de quem é a
            tecnologia (pedido do humano) e o que vai acontecer. Um widget de
            banco abrindo sem contexto nenhum é o que treina o usuário a não
            desconfiar de tela alguma. */}
        {pluggyEnabled && (
          <button type="button" className="vw-home-import" onClick={() => setImportOpen(true)}>
            <span
              className="vw-pluggy-badge"
              style={{ width: 32, height: 32, background: PLUGGY_BRAND.logoBackdrop }}
            >
              <img src={PLUGGY_BRAND.logo} alt="" width={32} height={32} />
            </span>
            <span className="vw-home-import-text">
              <span className="vw-home-import-title">
                {pluggyItems.length > 0 ? 'Importar do banco' : 'Conectar meu banco'}
              </span>
              <span className="vw-home-import-sub">
                {pluggyItems.length > 0
                  ? `${connectionSummary(pluggyItems.length)} · Open Finance via ${PLUGGY_BRAND.name}`
                  : `Traga seus lançamentos automaticamente via ${PLUGGY_BRAND.name}`}
              </span>
            </span>
            <span className="vw-home-import-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        )}
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

      {importOpen && (
        <PluggyImportModal
          items={pluggyItems}
          onClose={() => setImportOpen(false)}
          onImported={() => setReloadKey((k) => k + 1)}
          onItemsChanged={refreshPluggy}
        />
      )}
    </div>
  );
}
