// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  FixedIncomePosition,
  FixedIncomeSummary,
  PluggyFixedIncomeResponse,
  PortfolioSummary,
} from '@vetor-wallet/shared';
import type { ShellContext } from '../layout/ShellContext';
import { vi } from 'vitest';

/**
 * Achado do revisor da fatia c2 (T-091c/d): quando `renda-fixa` deixou de
 * ser `comingSoon`, o card do hub passou a cair no mesmo ramo que o de Ações
 * e exibir `stockTotals.current` (a carteira B3) sob o rótulo de Renda Fixa
 * — valor financeiro errado. A fatia c3 liga o resumo real de Renda Fixa
 * (`GET /api/fixed-income`), buscado à parte do `ShellContext`: estes testes
 * travam (1) que o card de Ações nunca muda de fonte, (2) que o card/total
 * de Renda Fixa usa o dado real quando o fetch funciona, e (3) que uma falha
 * nesse fetch fica isolada nele — nunca derruba a página inteira.
 *
 * O fetch de Renda Fixa é mockado via `getImpl`, uma função comum (não
 * `vi.fn().mockRejectedValue`) — a mesma armadilha documentada em
 * `PluggyImportModal.test.tsx`: uma promise rejeitada devolvida direto por um
 * spy do Vitest vira erro não tratado do runner, mesmo quando o componente
 * trata o erro corretamente.
 */

const shellContext: Partial<ShellContext> = {
  walletSummary: {
    positions: [],
    totalInvested: 1000,
    totalCurrentValue: 1234,
    totalProfitLoss: 234,
    totalProfitLossPct: 23.4,
  } as PortfolioSummary,
};

vi.mock('../layout/ShellContext', async () => {
  const actual =
    await vi.importActual<typeof import('../layout/ShellContext')>('../layout/ShellContext');
  return {
    ...actual,
    useShellContext: () => shellContext,
  };
});

let getImpl: () => Promise<{
  positions: FixedIncomePosition[];
  summary: FixedIncomeSummary;
}> = () => Promise.reject(new Error('getImpl não configurado neste teste'));

const NO_PLUGGY: PluggyFixedIncomeResponse = {
  enabled: true,
  connections: 0,
  failedConnections: 0,
  positions: [],
  otherInvestments: 0,
};

/** RF da conexão bancária (T-091d, fatia d2) — mesma regra do `getImpl`. */
let pluggyImpl: () => Promise<PluggyFixedIncomeResponse> = () => Promise.resolve(NO_PLUGGY);

vi.mock('../api', () => ({
  getFixedIncome: () => getImpl(),
  getPluggyFixedIncome: () => pluggyImpl(),
}));

const { InvestimentosPage } = await import('./InvestimentosPage');

function makePosition(overrides: Partial<FixedIncomePosition> = {}): FixedIncomePosition {
  return {
    id: 1,
    user_id: 1,
    superseded_by_pluggy_investment_id: null,
    name: 'CDB Banco X',
    kind: 'CDB',
    institution: '',
    invested_amount: 100,
    invested_at: '2026-01-01',
    maturity_date: '2026-12-01',
    rate_type: 'PRE',
    rate: 10,
    current_value: null,
    current_value_date: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  pluggyImpl = () => Promise.resolve(NO_PLUGGY);
});

function renderPage() {
  return render(
    <MemoryRouter>
      <InvestimentosPage />
    </MemoryRouter>
  );
}

describe('InvestimentosPage', () => {
  it('card de Ações mostra o total do ShellContext mesmo antes do fetch de Renda Fixa resolver', () => {
    getImpl = () =>
      new Promise(() => {
        /* nunca resolve neste teste — representa o estado "carregando" */
      });

    renderPage();

    const acoesCard = screen
      .getByText('Ações', { selector: '.vw-layer-card-name' })
      .closest('button')!;
    expect(acoesCard.textContent).toMatch(/1\.234,00/);

    const rendaFixaCard = screen
      .getByText('Renda Fixa', { selector: '.vw-layer-card-name' })
      .closest('button')!;
    expect(rendaFixaCard.textContent).toContain('—');
  });

  it('card e total de Renda Fixa usam o resumo real quando o fetch funciona, sem mudar o de Ações', async () => {
    getImpl = () =>
      Promise.resolve({
        positions: [makePosition()],
        summary: { totalInvested: 500, totalCurrent: 550 },
      });

    renderPage();

    const rendaFixaCard = await waitFor(() => {
      const card = screen
        .getByText('Renda Fixa', { selector: '.vw-layer-card-name' })
        .closest('button')!;
      expect(card.textContent).toMatch(/550,00/);
      return card;
    });
    expect(rendaFixaCard.textContent).not.toContain('—');

    // Ações continua exatamente o mesmo número do ShellContext.
    const acoesCard = screen
      .getByText('Ações', { selector: '.vw-layer-card-name' })
      .closest('button')!;
    expect(acoesCard.textContent).toMatch(/1\.234,00/);

    // Total consolidado: 1234 (Ações) + 550 (Renda Fixa) = 1784.
    const totalCard = screen.getByText('Total consolidado').closest('div')!;
    expect(totalCard.textContent).toMatch(/1\.784,00/);

    // Próximos vencimentos lista a posição buscada.
    expect(screen.getByText(/CDB Banco X/)).toBeTruthy();
  });

  it('isola a falha do fetch de Renda Fixa: card e total caem para traço/erro, Ações continua normal', async () => {
    getImpl = () => Promise.reject(new Error('network down'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar a Renda Fixa/)).toBeTruthy();
    });

    const rendaFixaCard = screen
      .getByText('Renda Fixa', { selector: '.vw-layer-card-name' })
      .closest('button')!;
    expect(rendaFixaCard.textContent).toContain('—');

    const acoesCard = screen
      .getByText('Ações', { selector: '.vw-layer-card-name' })
      .closest('button')!;
    expect(acoesCard.textContent).toMatch(/1\.234,00/);

    // Total consolidado cai para só Ações — nunca derruba a página.
    const totalCard = screen.getByText('Total consolidado').closest('div')!;
    expect(totalCard.textContent).toMatch(/1\.234,00/);

    expect(screen.getByText(/Não foi possível carregar os vencimentos de Renda Fixa/)).toBeTruthy();
  });

  describe('RF da conexão bancária (T-091d, fatia d2)', () => {
    const manual = () =>
      Promise.resolve({
        positions: [makePosition()],
        summary: { totalInvested: 500, totalCurrent: 550 },
      });

    it('card e total somam a RF manual com a da conexão, e o total diz quanto é da conexão', async () => {
      getImpl = manual;
      pluggyImpl = () =>
        Promise.resolve({
          ...NO_PLUGGY,
          connections: 1,
          positions: [
            {
              id: 'inv-lci',
              name: 'LCI Conectada',
              subtype: 'LCI',
              institution: null,
              investedAmount: 100,
              currentValue: 200,
              currentValueDate: '2026-10-01',
              maturityDate: null,
              rateType: null,
              rate: null,
            },
          ],
        });

      renderPage();

      // 550 (manual) + 200 (conexão) = 750.
      await waitFor(() => {
        const card = screen
          .getByText('Renda Fixa', { selector: '.vw-layer-card-name' })
          .closest('button')!;
        expect(card.textContent).toMatch(/750,00/);
      });
      // Total consolidado: 1234 (Ações) + 750 = 1984.
      const totalCard = screen.getByText('Total consolidado').closest('div')!;
      expect(totalCard.textContent).toMatch(/1\.984,00/);
      expect(totalCard.textContent).toMatch(
        /Inclui R\$\s200,00 de Renda Fixa da sua conexão bancária/
      );
    });

    it('isolamento: a leitura da conexão falha e a RF manual segue no card e no total', async () => {
      getImpl = manual;
      pluggyImpl = () => Promise.reject(new Error('network down'));

      renderPage();

      expect(
        await screen.findByText(/Não foi possível ler sua conexão bancária agora/)
      ).toBeTruthy();
      const rendaFixaCard = screen
        .getByText('Renda Fixa', { selector: '.vw-layer-card-name' })
        .closest('button')!;
      expect(rendaFixaCard.textContent).toMatch(/550,00/);
      const totalCard = screen.getByText('Total consolidado').closest('div')!;
      expect(totalCard.textContent).toMatch(/1\.784,00/);
      const acoesCard = screen
        .getByText('Ações', { selector: '.vw-layer-card-name' })
        .closest('button')!;
      expect(acoesCard.textContent).toMatch(/1\.234,00/);
    });
  });
});
