// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PluggyItemView, PluggySyncResponse } from '@vetor-wallet/shared';

/**
 * T-092 — o primeiro teste de render do web.
 *
 * ## Por que este componente
 *
 * `pluggyImport.ts` já tem teste de sobra para `importDisabledReason` e
 * `canConfirmReplace`. O que **nada** provava é que o modal chama essas funções:
 * um `disabled` invertido — um caractere — passaria verde na suíte inteira e
 * entregaria destravado o botão que apaga renda, despesa e poupança sem
 * desfazer. É o pior acidente possível do app, e era exatamente o não-coberto.
 *
 * ## O padrão (vale para os próximos)
 *
 * - `// @vitest-environment jsdom` no topo do arquivo. O default do runner
 *   segue `node`, para as centenas de testes de função pura não pagarem por um
 *   DOM que não usam.
 * - **Assertivas pelo que o usuário vê**: papel, texto, estado do botão. Nada
 *   de espiar estado interno — o teste tem de quebrar quando a TELA quebra, não
 *   quando o componente for refatorado.
 * - `../api` mockado: o componente é a unidade, rede não entra.
 * - Sem `@testing-library/jest-dom`: uma dependência a mais só por açúcar de
 *   assertiva não se paga, e `.disabled` é a mesma verdade lida do DOM.
 *
 * ## O spy registra; quem rejeita é uma função comum
 *
 * `syncPluggy.mockRejectedValue(...)` parece o caminho natural e **não
 * funciona aqui**: o spy do Vitest rastreia o resultado da promise que devolve
 * (`mock.settledResults`), e uma promise rejeitada devolvida por ele vira erro
 * não tratado do runner — o teste falha com a mensagem do erro mesmo quando o
 * componente tratou tudo certo (verificado: o erro aparece na tela e o teste
 * quebra assim mesmo). Por isso o spy abaixo só **registra a chamada** e a
 * resposta vem de `syncImpl`, uma função comum cuja rejeição o componente
 * consome normalmente.
 */

const syncPluggy = vi.fn();
let syncImpl: () => Promise<PluggySyncResponse> = () => Promise.reject(new Error('não definido'));

vi.mock('../api', () => ({
  syncPluggy: (...args: unknown[]) => {
    syncPluggy(...args);
    return syncImpl();
  },
  createPluggyConnectToken: vi.fn(),
  linkPluggyItem: vi.fn(),
  unlinkPluggyItem: vi.fn(),
}));

const { PluggyImportModal } = await import('./PluggyImportModal');

const ITEM: PluggyItemView = {
  itemId: 'item-de-teste',
  connectorId: 200,
  connectorName: 'Banco de Teste',
  status: 'UPDATED',
  createdAt: '2026-09-01 10:00:00',
  updatedAt: '2026-09-01 10:00:00',
};

/** Valores inventados: fixture nunca carrega dado real (convenção da raiz). */
const REPORT: PluggySyncResponse = {
  mode: 'replace',
  dateFrom: '2026-08-01',
  totals: { imported: 3, duplicated: 2, rejected: 0, skipped: 0, internal: 1, previewed: 0 },
  failures: 0,
  errors: [],
  transactions: [
    {
      status: 'imported',
      transactionId: 'tx-1',
      date: '2026-08-15',
      amount: -42.5,
      description: 'Lançamento inventado',
      entryType: 'expense',
    },
  ],
  wiped: { incomeEntries: 4, expenseEntries: 7, savingsEntries: 1 },
};

function renderModal(items: PluggyItemView[] = [ITEM]) {
  return render(
    <PluggyImportModal
      items={items}
      onClose={vi.fn()}
      onImported={vi.fn()}
      onItemsChanged={vi.fn()}
    />
  );
}

const importButton = () =>
  screen.getByRole('button', { name: /importar|substituir/i }) as HTMLButtonElement;
const travado = () => importButton().disabled;
const modoReplace = () => screen.getAllByRole('radio')[1];
const modoAppend = () => screen.getAllByRole('radio')[0];

beforeEach(() => {
  syncPluggy.mockReset();
  syncImpl = () => Promise.resolve(REPORT);
});
afterEach(() => cleanup());

describe('PluggyImportModal — trava do botão (T-092)', () => {
  it('sem banco conectado o botão fica travado E diz por quê', () => {
    renderModal([]);
    expect(travado()).toBe(true);
    expect(screen.getByText('Conecte um banco para liberar a importação.')).toBeTruthy();
  });

  it('com banco conectado e modo append o botão está liberado', () => {
    renderModal();
    expect(travado()).toBe(false);
  });

  it('modo replace trava o botão até a palavra ser digitada, e mostra os avisos', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(modoReplace());

    expect(travado()).toBe(true);
    expect(screen.getByText(/Digite APAGAR acima/)).toBeTruthy();
    // O bloco de perigo é `role="alert"`: quem usa leitor de tela precisa ouvir
    // o aviso, não só ver o vermelho.
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('digitar APAGAR libera o botão', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(modoReplace());
    await user.type(screen.getByRole('textbox'), 'APAGAR');

    expect(travado()).toBe(false);
  });

  it('voltar para append e retornar ao replace zera a confirmação', async () => {
    // Regra que vive no componente (um `useEffect` no `mode`) e é invisível
    // para os testes de função pura: um "APAGAR" digitado não pode continuar
    // valendo depois de uma ida e volta pelo modo seguro.
    const user = userEvent.setup();
    renderModal();

    await user.click(modoReplace());
    await user.type(screen.getByRole('textbox'), 'APAGAR');
    expect(travado()).toBe(false);

    await user.click(modoAppend());
    await user.click(modoReplace());

    expect(travado()).toBe(true);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  });

  it('botão travado não dispara importação nem por clique programático', () => {
    renderModal([]);
    importButton().click();
    expect(syncPluggy).not.toHaveBeenCalled();
  });
});

describe('PluggyImportModal — relatório (T-092)', () => {
  it('renderiza o resumo e o que foi apagado depois da importação', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(modoReplace());
    await user.type(screen.getByRole('textbox'), 'APAGAR');
    await user.click(importButton());

    await waitFor(() => expect(screen.getByText(/3 transações importadas/)).toBeTruthy());
    expect(syncPluggy).toHaveBeenCalledWith({ mode: 'replace' });
    // O que o replace apagou aparece na tela: é a informação que o usuário não
    // tem como recuperar de outro lugar.
    expect(screen.getByText(/Apagados antes de importar: 4 de renda/)).toBeTruthy();
  });

  it('falha na importação vira mensagem, e o modal não finge que deu certo', async () => {
    const user = userEvent.setup();
    syncImpl = () => Promise.reject(new Error('Pluggy fora do ar'));
    renderModal();

    await user.click(importButton());

    await waitFor(() => expect(screen.getByText('Pluggy fora do ar')).toBeTruthy());
    expect(screen.queryByText(/transações importadas/)).toBeNull();
  });
});
