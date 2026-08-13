import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PLUGGY_CATEGORY,
  DEFAULT_PLUGGY_DESCRIPTION,
  MAX_PLUGGY_DESCRIPTION_LENGTH,
  mapPluggyTransaction,
  parsePluggyDate,
  pluggyExternalId,
  type RawPluggyTransaction,
} from './pluggy';
import { MAX_EXTERNAL_ID_LENGTH } from './externalId';

/** Transação POSTED em conta, débito de R$ 123,45 — a base dos casos abaixo. */
function raw(overrides: Partial<RawPluggyTransaction> = {}): RawPluggyTransaction {
  return {
    id: 'tx-1',
    date: '2026-08-11T00:00:00.000Z',
    description: 'Supermercado Açaí',
    descriptionRaw: 'SUPERM ACAI 11/08',
    amount: -123.45,
    type: 'DEBIT',
    category: null,
    currencyCode: 'BRL',
    status: 'POSTED',
    ...overrides,
  };
}

describe('pluggyExternalId (T-087)', () => {
  it('prefixa com `pluggy:` (convenção da T-084)', () => {
    expect(pluggyExternalId('abc')).toBe('pluggy:abc');
  });
});

describe('parsePluggyDate (T-087)', () => {
  it('corta o timestamp em 10 chars SEM converter timezone', () => {
    // 00:00Z em BRT seria 31/07 21:00 — converter jogaria o gasto no mês anterior.
    expect(parsePluggyDate('2026-08-01T00:00:00.000Z')).toBe('2026-08-01');
    expect(parsePluggyDate('2026-07-31T23:30:00.000Z')).toBe('2026-07-31');
  });

  it('aceita data já sem hora', () => {
    expect(parsePluggyDate('2026-08-11')).toBe('2026-08-11');
  });

  it('rejeita data irreal e formato estranho (isValidIsoDate)', () => {
    expect(parsePluggyDate('2026-02-30T00:00:00.000Z')).toBeNull();
    expect(parsePluggyDate('11/08/2026')).toBeNull();
    expect(parsePluggyDate('')).toBeNull();
    expect(parsePluggyDate(null)).toBeNull();
  });
});

describe('mapPluggyTransaction — direção e valor (T-087)', () => {
  it('DEBIT em conta vira despesa com valor ABSOLUTO', () => {
    const res = mapPluggyTransaction(raw());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transaction).toMatchObject({
      transactionId: 'tx-1',
      externalId: 'pluggy:tx-1',
      date: '2026-08-11',
      amount: 123.45,
      entryType: 'expense',
      description: 'Supermercado Açaí',
      category: 'supermercado açaí',
    });
  });

  it('CREDIT em conta vira renda com valor absoluto', () => {
    const res = mapPluggyTransaction(raw({ type: 'CREDIT', amount: 5000, description: 'Salário' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transaction).toMatchObject({ amount: 5000, entryType: 'income' });
  });

  it('aceita type em caixa baixa', () => {
    const res = mapPluggyTransaction(raw({ type: 'debit' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transaction.entryType).toBe('expense');
  });

  it('rejeita quando o sinal discorda do type em conta BANK (não adivinha)', () => {
    // DEBIT com valor positivo em conta: fontes redundantes discordando.
    const res = mapPluggyTransaction(raw({ type: 'DEBIT', amount: 123.45 }));
    expect(res).toMatchObject({ ok: false, outcome: 'rejected' });
    if (res.ok) return;
    expect(res.reason).toMatch(/incoerente/);

    expect(mapPluggyTransaction(raw({ type: 'CREDIT', amount: -10 }))).toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
  });

  it('em cartão (CREDIT) a convenção de sinal é INVERTIDA', () => {
    // Compra nova no cartão: DEBIT com valor POSITIVO (aumenta a fatura).
    const compra = mapPluggyTransaction(raw({ type: 'DEBIT', amount: 99.9 }), 'CREDIT');
    expect(compra.ok).toBe(true);
    if (!compra.ok) return;
    expect(compra.transaction).toMatchObject({ amount: 99.9, entryType: 'expense' });

    // Pagamento/estorno da fatura: CREDIT com valor NEGATIVO.
    const estorno = mapPluggyTransaction(raw({ type: 'CREDIT', amount: -99.9 }), 'CREDIT');
    expect(estorno.ok).toBe(true);
    if (!estorno.ok) return;
    expect(estorno.transaction.entryType).toBe('income');

    // E o sinal "de conta" passa a ser o incoerente no cartão.
    expect(mapPluggyTransaction(raw({ type: 'DEBIT', amount: -99.9 }), 'CREDIT')).toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
  });

  it('rejeita valor zero, ausente, não finito e com 3 casas decimais', () => {
    for (const amount of [0, null, Number.NaN, 1.234]) {
      expect(mapPluggyTransaction(raw({ amount, type: 'CREDIT' }))).toMatchObject({ ok: false });
    }
  });
});

describe('mapPluggyTransaction — rejeições e pulos (T-087)', () => {
  it('rejeita transação sem id (nunca inventa id)', () => {
    const res = mapPluggyTransaction(raw({ id: null }));
    expect(res).toMatchObject({ ok: false, outcome: 'rejected' });
    if (res.ok) return;
    expect(res.reason).toMatch(/sem id/);
  });

  it(`rejeita id que estoura ${MAX_EXTERNAL_ID_LENGTH} chars COM o prefixo`, () => {
    const cabe = 'x'.repeat(MAX_EXTERNAL_ID_LENGTH - 'pluggy:'.length);
    expect(mapPluggyTransaction(raw({ id: cabe })).ok).toBe(true);

    const estoura = 'x'.repeat(MAX_EXTERNAL_ID_LENGTH - 'pluggy:'.length + 1);
    expect(mapPluggyTransaction(raw({ id: estoura }))).toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
  });

  it('PULA (skipped) a transação PENDING — não rejeita nem importa', () => {
    const res = mapPluggyTransaction(raw({ status: 'PENDING' }));
    expect(res).toMatchObject({ ok: false, outcome: 'skipped' });
    if (res.ok) return;
    expect(res.reason).toMatch(/pendente/i);
  });

  it('rejeita status desconhecido/ausente', () => {
    expect(mapPluggyTransaction(raw({ status: null }))).toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
    expect(mapPluggyTransaction(raw({ status: 'CANCELLED' }))).toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
  });

  it('rejeita moeda diferente de BRL e moeda ausente', () => {
    const usd = mapPluggyTransaction(raw({ currencyCode: 'USD' }));
    expect(usd).toMatchObject({ ok: false, outcome: 'rejected' });
    if (usd.ok) return;
    expect(usd.reason).toMatch(/Moeda não suportada/);

    expect(mapPluggyTransaction(raw({ currencyCode: null }))).toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
  });

  it('rejeita data inválida', () => {
    const res = mapPluggyTransaction(raw({ date: '2026-02-30T00:00:00.000Z' }));
    expect(res).toMatchObject({ ok: false, outcome: 'rejected' });
    if (res.ok) return;
    expect(res.reason).toMatch(/Data inválida/);
  });

  it('rejeita type desconhecido', () => {
    expect(mapPluggyTransaction(raw({ type: 'TRANSFER' }))).toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
  });
});

describe('mapPluggyTransaction — descrição e categoria (T-087)', () => {
  it('usa descriptionRaw quando description não vem', () => {
    const res = mapPluggyTransaction(raw({ description: null }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transaction.description).toBe('SUPERM ACAI 11/08');
  });

  it('cai no texto padrão e na categoria `outros` sem descrição nenhuma', () => {
    const res = mapPluggyTransaction(raw({ description: null, descriptionRaw: null }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transaction.description).toBe(DEFAULT_PLUGGY_DESCRIPTION);
    expect(res.transaction.category).toBe(DEFAULT_PLUGGY_CATEGORY);
  });

  it('prefere a category da Pluggy, normalizada', () => {
    const res = mapPluggyTransaction(raw({ category: '  Supermercados  ' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transaction.category).toBe('supermercados');
  });

  it(`trunca descrição em ${MAX_PLUGGY_DESCRIPTION_LENGTH} chars`, () => {
    const res = mapPluggyTransaction(raw({ description: 'a'.repeat(500) }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transaction.description).toHaveLength(MAX_PLUGGY_DESCRIPTION_LENGTH);
    expect(res.transaction.category).toHaveLength(MAX_PLUGGY_DESCRIPTION_LENGTH);
  });
});

describe('mapPluggyTransaction — movimentação interna (T-088)', () => {
  it.each([
    ['Same person transfer', /próprio titular/],
    ['Credit card payment', /fatura/],
    ['Investments', /investimento/],
  ])('categoria %s sai como `internal`, com motivo', (category, motivo) => {
    const res = mapPluggyTransaction(raw({ category }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.outcome).toBe('internal');
    expect(res.reason).toMatch(motivo);
  });

  it('vale para as duas direções — o resgate não vira renda', () => {
    const res = mapPluggyTransaction(raw({ category: 'Investments', type: 'CREDIT', amount: 900 }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.outcome).toBe('internal');
  });

  it('a decisão vem ANTES do status: pendente e efetivada dão o mesmo desfecho', () => {
    const pendente = mapPluggyTransaction(raw({ category: 'Investments', status: 'PENDING' }));
    const efetivada = mapPluggyTransaction(raw({ category: 'Investments', status: 'POSTED' }));
    expect(pendente.ok).toBe(false);
    expect(efetivada.ok).toBe(false);
    if (pendente.ok || efetivada.ok) return;
    // Sem isso a mesma transação seria `skipped` numa passagem e `internal` na
    // seguinte — relatório instável para uma linha que nunca vai ser importada.
    expect(pendente.outcome).toBe('internal');
    expect(efetivada.outcome).toBe('internal');
  });

  it('interna com sinal incoerente não vira `rejected` — não pede atenção à toa', () => {
    // DEBIT positivo em conta BANK seria rejeitado se a checagem viesse depois.
    const res = mapPluggyTransaction(raw({ category: 'Credit card payment', amount: 500 }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.outcome).toBe('internal');
  });

  it('mas a transação SEM id continua rejeitada, mesmo sendo interna', () => {
    // Sem id não há linha identificável no relatório; o defeito de dados vem primeiro.
    const res = mapPluggyTransaction(raw({ id: null, category: 'Investments' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.outcome).toBe('rejected');
  });

  it('categoria de gasto comum segue virando lançamento', () => {
    const res = mapPluggyTransaction(raw({ category: 'Supermarket' }));
    expect(res.ok).toBe(true);
  });
});
