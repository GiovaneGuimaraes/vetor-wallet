// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PortfolioSummary } from '@vetor-wallet/shared';
import type { ShellContext } from '../layout/ShellContext';

/**
 * Achado do revisor da fatia c2 (T-091c/d): quando `renda-fixa` deixou de
 * ser `comingSoon`, o card do hub passou a cair no mesmo ramo que o de
 * Ações e exibir `stockTotals.current` (a carteira B3) sob o rótulo de
 * Renda Fixa — valor financeiro errado. Este teste trava que só o nó
 * `acoes` mostra esse número; qualquer outro nó "pronto" mostra o traço
 * até ter o próprio resumo buscado (fatia c3).
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

const { InvestimentosPage } = await import('./InvestimentosPage');

describe('InvestimentosPage', () => {
  it('mostra o total da carteira B3 só no card de Ações', () => {
    render(
      <MemoryRouter>
        <InvestimentosPage />
      </MemoryRouter>
    );

    const acoesCard = screen.getByText('Ações').closest('button')!;
    expect(acoesCard.textContent).toMatch(/1\.234,00/);

    const rendaFixaCard = screen.getByText('Renda Fixa').closest('button')!;
    expect(rendaFixaCard.textContent).not.toMatch(/1\.234,00/);
    expect(rendaFixaCard.textContent).toContain('—');
  });
});
