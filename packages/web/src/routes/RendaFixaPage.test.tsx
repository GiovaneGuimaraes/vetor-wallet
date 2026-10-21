// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  FixedIncomePosition,
  PluggyFixedIncomePosition,
  PluggyFixedIncomeResponse,
} from '@vetor-wallet/shared';

/**
 * Testes de COSTURA (T-092): o componente chamando a lógica pura já coberta
 * em `fixedIncome.test.ts` (validação, ordenação, rótulos) e o fluxo que vive
 * dentro dele — não re-testa a lógica pura em si.
 *
 * Mesma armadilha documentada em `PluggyImportModal.test.tsx`: um
 * `mockRejectedValue` num `vi.fn()` faz o runner tratar a rejeição como erro
 * não tratado mesmo com o componente tratando certo. Por isso os mocks de
 * mutação (create/update/delete) delegam para uma função comum (`impl`) cuja
 * rejeição o componente consome normalmente.
 */

const getFixedIncome = vi.fn();
const createFixedIncomePosition = vi.fn();
const updateFixedIncomePosition = vi.fn();
const deleteFixedIncomePosition = vi.fn();

let createImpl: () => Promise<FixedIncomePosition> = () =>
  Promise.reject(new Error('não definido'));

/** Sem conexão bancária: a resposta normal de quem nunca ligou a Pluggy. */
const NO_PLUGGY: PluggyFixedIncomeResponse = {
  enabled: true,
  connections: 0,
  failedConnections: 0,
  positions: [],
  otherInvestments: 0,
};

// Função comum, não `vi.fn().mockRejectedValue` — ver nota no topo.
let pluggyImpl: () => Promise<PluggyFixedIncomeResponse> = () => Promise.resolve(NO_PLUGGY);
/** A última promise devolvida, para o teste esperar a leitura da conexão terminar. */
let lastPluggyCall: Promise<unknown> = Promise.resolve();

vi.mock('../api', () => ({
  getFixedIncome: (...args: unknown[]) => getFixedIncome(...args),
  getPluggyFixedIncome: () => (lastPluggyCall = pluggyImpl()),
  createFixedIncomePosition: (...args: unknown[]) => {
    createFixedIncomePosition(...args);
    return createImpl();
  },
  updateFixedIncomePosition: (...args: unknown[]) => updateFixedIncomePosition(...args),
  deleteFixedIncomePosition: (...args: unknown[]) => deleteFixedIncomePosition(...args),
}));

const { RendaFixaPage } = await import('./RendaFixaPage');

/** Valores inventados: fixture nunca carrega dado real (convenção da raiz). */
function makePosition(overrides: Partial<FixedIncomePosition> = {}): FixedIncomePosition {
  return {
    id: 1,
    user_id: 1,
    superseded_by_pluggy_investment_id: null,
    name: 'CDB Banco X',
    kind: 'CDB',
    institution: 'Banco X',
    invested_amount: 1000,
    invested_at: '2026-01-10',
    maturity_date: '2099-01-10',
    rate_type: 'CDI',
    rate: 110,
    current_value: null,
    current_value_date: null,
    created_at: '2026-01-10T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RendaFixaPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  getFixedIncome.mockReset();
  createFixedIncomePosition.mockReset();
  updateFixedIncomePosition.mockReset();
  deleteFixedIncomePosition.mockReset();
  createImpl = () => Promise.reject(new Error('não definido'));
  pluggyImpl = () => Promise.resolve(NO_PLUGGY);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RendaFixaPage', () => {
  it('lista as posições com rótulo de vencimento, taxa e valor exibido', async () => {
    getFixedIncome.mockResolvedValue({
      positions: [makePosition()],
      summary: { totalInvested: 1000, totalCurrent: 1000 },
    });

    renderPage();

    expect(await screen.findByText(/CDB Banco X/)).toBeTruthy();
    expect(screen.getByText(/110% do CDI/)).toBeTruthy();
    expect(screen.getByText(/Valor aplicado em 10\/01\/2026/)).toBeTruthy();
    // O total aplicado e o valor exibido coincidem (sem saldo informado) —
    // dois elementos com o mesmo texto é esperado aqui.
    expect(screen.getAllByText('R$ 1.000,00').length).toBeGreaterThanOrEqual(2);
  });

  it('mostra "Saldo informado" quando a posição tem current_value', async () => {
    getFixedIncome.mockResolvedValue({
      positions: [makePosition({ current_value: 1234.5, current_value_date: '2026-06-01' })],
      summary: { totalInvested: 1000, totalCurrent: 1234.5 },
    });

    renderPage();

    expect(await screen.findByText(/Saldo informado em 01\/06\/2026/)).toBeTruthy();
    // O total atual e o valor exibido da linha coincidem (única posição) —
    // dois elementos com o mesmo texto é esperado aqui.
    expect(screen.getAllByText('R$ 1.234,50').length).toBeGreaterThanOrEqual(2);
  });

  it('mostra erro quando o carregamento inicial falha', async () => {
    getFixedIncome.mockRejectedValue(new Error('Falha ao buscar posições de renda fixa'));

    renderPage();

    expect(await screen.findByText('Falha ao buscar posições de renda fixa')).toBeTruthy();
  });

  it('mostra estado vazio quando não há posições', async () => {
    getFixedIncome.mockResolvedValue({
      positions: [],
      summary: { totalInvested: 0, totalCurrent: 0 },
    });

    renderPage();

    expect(await screen.findByText(/Nenhuma posição de renda fixa cadastrada/)).toBeTruthy();
  });

  it('trava o submit com formulário inválido e não chama a API', async () => {
    getFixedIncome.mockResolvedValue({
      positions: [],
      summary: { totalInvested: 0, totalCurrent: 0 },
    });

    renderPage();
    await screen.findByText(/Nenhuma posição/);

    fireEvent.click(screen.getByRole('button', { name: 'Nova posição' }));
    // Nome vazio, valor aplicado vazio, data vazia, taxa vazia: submit deve
    // ser rejeitado pela validação pura, sem round-trip de rede.
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar posição' }));

    expect(await screen.findByText(/Informe um nome/)).toBeTruthy();
    expect(createFixedIncomePosition).not.toHaveBeenCalled();
  });

  it('submit válido chama a API e atualiza a lista', async () => {
    getFixedIncome
      .mockResolvedValueOnce({
        positions: [],
        summary: { totalInvested: 0, totalCurrent: 0 },
      })
      .mockResolvedValueOnce({
        positions: [makePosition()],
        summary: { totalInvested: 1000, totalCurrent: 1000 },
      });
    createImpl = () => Promise.resolve(makePosition());

    renderPage();
    await screen.findByText(/Nenhuma posição/);

    fireEvent.click(screen.getByRole('button', { name: 'Nova posição' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'CDB Banco X' } });
    fireEvent.change(screen.getByLabelText('Valor aplicado (R$)'), {
      target: { value: '1000' },
    });
    fireEvent.change(screen.getByLabelText('Data da aplicação'), {
      target: { value: '2026-01-10' },
    });
    fireEvent.change(screen.getByLabelText('Taxa'), { target: { value: '110' } });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar posição' }));

    await waitFor(() => expect(createFixedIncomePosition).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/CDB Banco X/)).toBeTruthy();
  });

  it('mostra o erro da API quando a criação falha', async () => {
    getFixedIncome.mockResolvedValue({
      positions: [],
      summary: { totalInvested: 0, totalCurrent: 0 },
    });
    createImpl = () => Promise.reject(new Error('Falha ao criar posição de renda fixa'));

    renderPage();
    await screen.findByText(/Nenhuma posição/);

    fireEvent.click(screen.getByRole('button', { name: 'Nova posição' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'CDB Banco X' } });
    fireEvent.change(screen.getByLabelText('Valor aplicado (R$)'), {
      target: { value: '1000' },
    });
    fireEvent.change(screen.getByLabelText('Data da aplicação'), {
      target: { value: '2026-01-10' },
    });
    fireEvent.change(screen.getByLabelText('Taxa'), { target: { value: '110' } });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar posição' }));

    expect(await screen.findByText('Falha ao criar posição de renda fixa')).toBeTruthy();
  });

  it('exclui uma posição após confirmação', async () => {
    getFixedIncome
      .mockResolvedValueOnce({
        positions: [makePosition()],
        summary: { totalInvested: 1000, totalCurrent: 1000 },
      })
      .mockResolvedValueOnce({
        positions: [],
        summary: { totalInvested: 0, totalCurrent: 0 },
      });
    deleteFixedIncomePosition.mockResolvedValue(undefined);

    renderPage();
    await screen.findByText(/CDB Banco X/);

    fireEvent.click(screen.getByRole('button', { name: 'Remover posição' }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(deleteFixedIncomePosition).toHaveBeenCalledWith(1));
    expect(await screen.findByText(/Nenhuma posição de renda fixa cadastrada/)).toBeTruthy();
  });

  it('não exclui quando o usuário cancela a confirmação', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    getFixedIncome.mockResolvedValue({
      positions: [makePosition()],
      summary: { totalInvested: 1000, totalCurrent: 1000 },
    });

    renderPage();
    await screen.findByText(/CDB Banco X/);

    fireEvent.click(screen.getByRole('button', { name: 'Remover posição' }));

    expect(deleteFixedIncomePosition).not.toHaveBeenCalled();
  });
});

/** Valores inventados (T-091d, fatia d2). */
function makePluggyPosition(
  overrides: Partial<PluggyFixedIncomePosition> = {}
): PluggyFixedIncomePosition {
  return {
    id: 'inv-lci',
    name: 'LCI Conectada',
    subtype: 'LCI',
    institution: 'Banco Y',
    investedAmount: 400,
    currentValue: 500,
    currentValueDate: '2026-10-01',
    maturityDate: '2099-06-01',
    rateType: 'CDI',
    rate: 95,
    ...overrides,
  };
}

describe('RendaFixaPage — RF da conexão bancária (T-091d, fatia d2)', () => {
  beforeEach(() => {
    getFixedIncome.mockResolvedValue({
      positions: [makePosition()],
      summary: { totalInvested: 1000, totalCurrent: 1000 },
    });
  });

  it('sem conexão: a tela fica como antes — sem seção da conexão nem total consolidado', async () => {
    renderPage();
    await screen.findByText(/CDB Banco X/);
    // Deixa o fetch da Pluggy resolver antes de olhar a ausência.
    await act(async () => {
      await lastPluggyCall.catch(() => {});
    });

    expect(screen.queryByText('Da sua conexão bancária')).toBeNull();
    expect(screen.queryByText('Total consolidado')).toBeNull();
    expect(screen.queryByText('Lançada por você')).toBeNull();
    expect(screen.queryByText(/Não foi possível ler sua conexão/)).toBeNull();
  });

  it('integração desligada: idem, nada da conexão aparece', async () => {
    pluggyImpl = () =>
      Promise.resolve({ ...NO_PLUGGY, enabled: false, positions: [makePluggyPosition()] });

    renderPage();
    await screen.findByText(/CDB Banco X/);
    await act(async () => {
      await lastPluggyCall.catch(() => {});
    });

    expect(screen.queryByText('Da sua conexão bancária')).toBeNull();
    expect(screen.queryByText(/LCI Conectada/)).toBeNull();
  });

  it('com conexão: mostra as duas fontes rotuladas e o total consolidado soma as duas', async () => {
    pluggyImpl = () =>
      Promise.resolve({ ...NO_PLUGGY, connections: 1, positions: [makePluggyPosition()] });

    renderPage();

    expect(await screen.findByText(/LCI Conectada · Banco Y/)).toBeTruthy();
    const pluggySection = screen.getByRole('region', { name: 'Da sua conexão bancária' });
    expect(pluggySection.textContent).toMatch(/Não fica gravado no app/);
    expect(pluggySection.textContent).toMatch(/R\$\s500,00/);
    expect(pluggySection.textContent).toMatch(/Taxa 95 \(CDI\)/);
    // A posição manual NÃO está dentro da seção da conexão.
    expect(pluggySection.textContent).not.toMatch(/CDB Banco X/);

    expect(screen.getByRole('heading', { name: 'Lançada por você' })).toBeTruthy();
    expect(screen.getByText(/CDB Banco X/)).toBeTruthy();

    // 1000 (manual) + 500 (conexão) = 1500.
    const consolidated = screen.getByTestId('fi-consolidated');
    expect(consolidated.textContent).toMatch(/1\.500,00/);
    expect(consolidated.textContent).toMatch(/Lançada por você: R\$\s1\.000,00/);
    expect(consolidated.textContent).toMatch(/Da sua conexão bancária: R\$\s500,00/);
  });

  it('posição da conexão sem saldo não entra na soma e diz isso na linha', async () => {
    pluggyImpl = () =>
      Promise.resolve({
        ...NO_PLUGGY,
        connections: 1,
        positions: [makePluggyPosition({ currentValue: null })],
      });

    renderPage();

    expect(await screen.findByText('Sem saldo informado')).toBeTruthy();
    expect(screen.getByTestId('fi-consolidated').textContent).toMatch(/R\$\s1\.000,00/);
  });

  it('isolamento: a leitura da conexão falha e a RF manual renderiza normalmente', async () => {
    pluggyImpl = () => Promise.reject(new Error('Falha ao ler a renda fixa da conexão bancária'));

    renderPage();

    expect(await screen.findByText(/Não foi possível ler sua conexão bancária agora/)).toBeTruthy();
    // Lista, resumo e formulário manuais intactos.
    expect(screen.getByText(/CDB Banco X/)).toBeTruthy();
    expect(screen.getAllByText('R$ 1.000,00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Editar posição' })).toBeTruthy();
    expect(screen.queryByText('Total consolidado')).toBeNull();
    // A mensagem de erro da conexão não substituiu a página pelo erro de carga.
    expect(screen.queryByText('Falha ao ler a renda fixa da conexão bancária')).toBeNull();
  });

  it('conexão parcialmente fora do ar: avisa que o total pode estar incompleto', async () => {
    pluggyImpl = () =>
      Promise.resolve({
        ...NO_PLUGGY,
        connections: 2,
        failedConnections: 1,
        positions: [makePluggyPosition()],
      });

    renderPage();

    expect(await screen.findByText(/1 conexão bancária não respondeu agora/)).toBeTruthy();
    expect(screen.getByText(/LCI Conectada/)).toBeTruthy();
  });
});

describe('RendaFixaPage — vínculo manual↔conexão (T-091d, fatia d3b)', () => {
  const linkedManual = (overrides: Partial<FixedIncomePosition> = {}) =>
    makePosition({ superseded_by_pluggy_investment_id: 'inv-lci', ...overrides });

  function withManual(positions: FixedIncomePosition[]) {
    getFixedIncome.mockResolvedValue({
      positions,
      summary: { totalInvested: 1000, totalCurrent: 1000 },
    });
  }

  async function settlePluggy() {
    await act(async () => {
      await lastPluggyCall.catch(() => {});
    });
  }

  it('vínculo ativo: a manual fica esmaecida com o selo e sai do total consolidado', async () => {
    withManual([linkedManual()]);
    pluggyImpl = () =>
      Promise.resolve({ ...NO_PLUGGY, connections: 1, positions: [makePluggyPosition()] });

    renderPage();

    expect(await screen.findByText('Coberta pela conexão · fora do total')).toBeTruthy();
    expect(screen.getByTestId('fi-manual-1').className).toMatch(/vw-fi-covered/);
    // Só os 500 da conexão: os 1000 da manual coberta não contam duas vezes.
    const consolidated = screen.getByTestId('fi-consolidated');
    expect(consolidated.textContent).toMatch(/^Total consolidadoR\$\s500,00/);
    expect(consolidated.textContent).toMatch(/Lançada por você: R\$\s0,00/);
    expect(screen.getByText(/disso está coberto pela conexão/)).toBeTruthy();
    // Lado da conexão ganha o selo com o nome da manual.
    const pluggySection = screen.getByRole('region', { name: 'Da sua conexão bancária' });
    expect(pluggySection.textContent).toMatch(/Vinculada a "CDB Banco X"/);
    expect(screen.getByRole('button', { name: 'Desvincular' })).toBeTruthy();
  });

  it('vínculo N→1: o lado da conexão conta as posições', async () => {
    withManual([linkedManual(), linkedManual({ id: 2, name: 'CDB Banco Z' })]);
    pluggyImpl = () =>
      Promise.resolve({ ...NO_PLUGGY, connections: 1, positions: [makePluggyPosition()] });

    renderPage();

    expect(await screen.findByText('Vinculada a 2 posições suas')).toBeTruthy();
    expect(screen.getAllByText('Coberta pela conexão · fora do total')).toHaveLength(2);
  });

  it('conexão em erro: a vinculada volta a contar e a linha diz por quê', async () => {
    withManual([linkedManual()]);
    pluggyImpl = () => Promise.reject(new Error('falhou'));

    renderPage();

    expect(await screen.findByText(/não foi possível lê-la agora/)).toBeTruthy();
    expect(screen.getByTestId('fi-manual-1').className).not.toMatch(/vw-fi-covered/);
    expect(screen.queryByText(/disso está coberto/)).toBeNull();
  });

  it('integração desligada: volta a contar, diz por quê, e Desvincular segue funcionando', async () => {
    withManual([linkedManual()]);
    pluggyImpl = () =>
      Promise.resolve({ ...NO_PLUGGY, enabled: false, positions: [makePluggyPosition()] });
    updateFixedIncomePosition.mockResolvedValue(
      linkedManual({ superseded_by_pluggy_investment_id: null })
    );

    renderPage();
    await screen.findByText(/CDB Banco X/);
    await settlePluggy();

    expect(screen.getByText(/conexão bancária não está disponível agora/)).toBeTruthy();
    const unlink = screen.getByRole('button', { name: 'Desvincular' }) as HTMLButtonElement;
    expect(unlink.disabled).toBe(false);
    fireEvent.click(unlink);

    await waitFor(() =>
      expect(updateFixedIncomePosition).toHaveBeenCalledWith(1, {
        supersededByPluggyInvestmentId: null,
      })
    );
  });

  it('sem conexão: volta a contar e diz por quê', async () => {
    withManual([linkedManual()]);

    renderPage();
    await screen.findByText(/CDB Banco X/);
    await settlePluggy();

    expect(screen.getByText(/conexão bancária não está disponível agora/)).toBeTruthy();
  });

  it('investimento ausente da conexão: volta a contar no consolidado e diz por quê', async () => {
    withManual([linkedManual()]);
    pluggyImpl = () =>
      Promise.resolve({
        ...NO_PLUGGY,
        connections: 1,
        positions: [makePluggyPosition({ id: 'outro' })],
      });

    renderPage();

    expect(await screen.findByText(/não aparece mais na sua conexão/)).toBeTruthy();
    // 1000 (manual de volta) + 500 (conexão).
    expect(screen.getByTestId('fi-consolidated').textContent).toMatch(/1\.500,00/);
  });

  it('investimento sem saldo na conexão: volta a contar e diz por quê', async () => {
    withManual([linkedManual()]);
    pluggyImpl = () =>
      Promise.resolve({
        ...NO_PLUGGY,
        connections: 1,
        positions: [makePluggyPosition({ currentValue: null })],
      });

    renderPage();

    expect(await screen.findByText(/sem saldo informado pela conexão/)).toBeTruthy();
    expect(screen.getByTestId('fi-consolidated').textContent).toMatch(
      /Lançada por você: R\$\s1\.000,00/
    );
  });

  it('vincular: lista sem nada marcado, confirmar travado até escolher, e só grava no clique', async () => {
    withManual([makePosition()]);
    pluggyImpl = () =>
      Promise.resolve({
        ...NO_PLUGGY,
        connections: 1,
        positions: [
          makePluggyPosition({ id: 'inv-longe', name: 'Longe', maturityDate: null }),
          makePluggyPosition({ id: 'inv-perto', name: 'Perto', maturityDate: '2099-01-10' }),
          makePluggyPosition({ id: null, name: 'Sem Id' }),
        ],
      });
    updateFixedIncomePosition.mockResolvedValue(
      makePosition({ superseded_by_pluggy_investment_id: 'inv-longe' })
    );

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Vincular à conexão' }));

    const picker = screen.getByTestId('fi-link-picker-1');
    const radios = Array.from(picker.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    // Sem id não é alvo possível; o mesmo vencimento vem primeiro.
    expect(radios.map((r) => r.value)).toEqual(['inv-perto', 'inv-longe']);
    expect(radios.every((r) => !r.checked)).toBe(true);

    const confirm = screen.getByRole('button', { name: 'Confirmar vínculo' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(updateFixedIncomePosition).not.toHaveBeenCalled();

    // Escolher sozinho não grava nada.
    fireEvent.click(radios[1]);
    expect(updateFixedIncomePosition).not.toHaveBeenCalled();
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() =>
      expect(updateFixedIncomePosition).toHaveBeenCalledWith(1, {
        supersededByPluggyInvestmentId: 'inv-longe',
      })
    );
  });

  it('vincular e cancelar não grava nada', async () => {
    withManual([makePosition()]);
    pluggyImpl = () =>
      Promise.resolve({ ...NO_PLUGGY, connections: 1, positions: [makePluggyPosition()] });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Vincular à conexão' }));
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByTestId('fi-link-picker-1')).toBeNull();
    expect(updateFixedIncomePosition).not.toHaveBeenCalled();
  });

  it('sem conexão trazendo RF, não oferece vincular', async () => {
    withManual([makePosition()]);

    renderPage();
    await screen.findByText(/CDB Banco X/);
    await settlePluggy();

    expect(screen.queryByRole('button', { name: 'Vincular à conexão' })).toBeNull();
  });
});
