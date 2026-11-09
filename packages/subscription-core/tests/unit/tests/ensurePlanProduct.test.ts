import { ensurePlanProduct } from 'src/ensurePlanProduct';
import { createFakeBillingDb, type FakeBillingDb, fakePlan } from 'tests/unit/fakeBillingDb';
import {
  calledPaths,
  errorEnvelope,
  mockFetch,
  okEnvelope,
  rawResponse,
  routeFetch,
} from 'tests/unit/mockFetch';

const ensure = (db: FakeBillingDb, planOver: Partial<ReturnType<typeof fakePlan>> = {}) => {
  return ensurePlanProduct({ query: db.query, plan: { ...db.state.plans[0], ...planOver } });
};

/**
 * Provedor com um catálogo de produtos em memória e o comportamento medido na
 * API real: `externalId` repetido → 400 "Product with externalId already exists".
 */
const catalogProvider = (fetchMock: jest.Mock, catalog: Record<string, unknown>[] = []) => {
  let seq = 0;
  routeFetch(fetchMock, (path, body) => {
    if (path.startsWith('/products/get?externalId=')) {
      const ext = decodeURIComponent(path.split('=')[1]);
      const found = catalog.find((p) => p.externalId === ext);
      return found ? okEnvelope(found) : errorEnvelope('Product not found', 404);
    }
    if (path === '/products/create') {
      if (catalog.some((p) => p.externalId === body.externalId)) {
        return errorEnvelope('Product with externalId already exists', 400);
      }
      seq += 1;
      const product = { id: `prod_${seq}`, ...body };
      catalog.push(product);
      return okEnvelope(product);
    }
    return undefined;
  });
  return catalog;
};

describe('ensurePlanProduct', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
  });

  test('produto gravado com o preço atual: devolve sem chamar o provedor', async () => {
    const db = createFakeBillingDb({
      plans: [fakePlan({ abacate_product_id: 'prod_ok', abacate_product_price_cents: 1990 })],
    });

    expect(await ensure(db)).toEqual({ productId: 'prod_ok', created: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('sem produto: cria com externalId código:preço, preço em centavos, ciclo e nome; grava no plano', async () => {
    catalogProvider(fetchMock);
    const db = createFakeBillingDb();

    expect(await ensure(db)).toEqual({ productId: 'prod_1', created: true });
    const create = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/products/create'))!;
    expect(JSON.parse(create[1].body)).toEqual({
      externalId: 'pro_monthly:1990',
      name: 'Vetor Wallet — Pro Mensal',
      price: 1990,
      currency: 'BRL',
      cycle: 'MONTHLY',
    });
    expect(db.state.plans[0]).toMatchObject({
      abacate_product_id: 'prod_1',
      abacate_product_price_cents: 1990,
    });
  });

  test('plano anual cria com ciclo ANNUALLY', async () => {
    catalogProvider(fetchMock);
    const db = createFakeBillingDb({
      plans: [fakePlan({ code: 'pro_yearly', interval: 'yearly', price_cents: 19900 })],
    });

    await ensure(db);

    const create = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/products/create'))!;
    expect(JSON.parse(create[1].body)).toMatchObject({
      cycle: 'ANNUALLY',
      externalId: 'pro_yearly:19900',
    });
  });

  test('produto já existe no provedor (banco perdeu o vínculo): reaproveita, não cria', async () => {
    catalogProvider(fetchMock, [{ id: 'prod_x', externalId: 'pro_monthly:1990', price: 1990 }]);
    const db = createFakeBillingDb();

    expect(await ensure(db)).toEqual({ productId: 'prod_x', created: false });
    expect(calledPaths(fetchMock)).toEqual(['/products/get?externalId=pro_monthly%3A1990']);
    expect(db.state.plans[0].abacate_product_id).toBe('prod_x');
  });

  test('PREÇO MUDOU: não reaproveita o produto do preço velho — cria outro, com outra chave', async () => {
    const catalog = catalogProvider(fetchMock, [
      { id: 'prod_old', externalId: 'pro_monthly:1990', price: 1990 },
    ]);
    const db = createFakeBillingDb({
      plans: [
        fakePlan({
          price_cents: 2490,
          abacate_product_id: 'prod_old',
          abacate_product_price_cents: 1990,
        }),
      ],
    });

    expect(await ensure(db)).toEqual({ productId: 'prod_1', created: true });
    expect(catalog.map((p) => p.externalId)).toEqual(['pro_monthly:1990', 'pro_monthly:2490']);
    expect(db.state.plans[0]).toMatchObject({
      abacate_product_id: 'prod_1',
      abacate_product_price_cents: 2490,
    });
  });

  test('CORRIDA: dois ao mesmo tempo → um cria, o outro leva 400 "already exists" e relê o mesmo produto', async () => {
    const catalog = catalogProvider(fetchMock);
    const db = createFakeBillingDb();

    const [a, b] = await Promise.all([ensure(db), ensure(db)]);

    expect(catalog).toHaveLength(1);
    expect(a.productId).toBe('prod_1');
    expect(b.productId).toBe('prod_1');
    expect([a, b].filter((r) => r.created)).toHaveLength(1);
  });

  test('400 "already exists" mas a releitura não acha: relança o erro original', async () => {
    routeFetch(fetchMock, (path) => {
      if (path.startsWith('/products/get')) return errorEnvelope('Product not found', 404);
      if (path === '/products/create')
        return errorEnvelope('Product with externalId already exists', 400);
      return undefined;
    });
    const db = createFakeBillingDb();

    await expect(ensure(db)).rejects.toMatchObject({ name: 'AbacatePayError', status: 400 });
    expect(db.state.plans[0].abacate_product_id).toBeNull();
  });

  test.each([
    ['400 de outro motivo', errorEnvelope('invalid cycle', 400)],
    ['500', errorEnvelope('boom', 500)],
    ['400 sem texto', rawResponse({ data: null, error: { code: 1 } }, 400)],
  ])('falha na criação (%s) sobe sem reler', async (_l, response) => {
    routeFetch(fetchMock, (path) => {
      if (path.startsWith('/products/get')) return errorEnvelope('Product not found', 404);
      if (path === '/products/create') return response;
      return undefined;
    });
    const db = createFakeBillingDb();

    await expect(ensure(db)).rejects.toMatchObject({ name: 'AbacatePayError' });
    expect(calledPaths(fetchMock).filter((p) => p.startsWith('/products/get'))).toHaveLength(1);
  });

  test('erro que não é do provedor (bug) também sobe', async () => {
    const db = createFakeBillingDb({ plans: [fakePlan({ interval: 'weekly' as never })] });
    catalogProvider(fetchMock);

    await expect(ensure(db)).rejects.toThrow('Intervalo de plano sem ciclo');
  });

  test('produto do provedor com preço DIFERENTE do plano: recusa (nunca cobra o valor errado)', async () => {
    catalogProvider(fetchMock, [{ id: 'prod_x', externalId: 'pro_monthly:1990', price: 999 }]);
    const db = createFakeBillingDb();

    await expect(ensure(db)).rejects.toThrow(
      'Produto prod_x tem preço 999 no provedor, plano cobra 1990'
    );
    expect(db.state.plans[0].abacate_product_id).toBeNull();
  });

  test('produto do provedor sem preço declarado é aceito (o externalId já fixa o preço)', async () => {
    catalogProvider(fetchMock, [{ id: 'prod_x', externalId: 'pro_monthly:1990' }]);
    const db = createFakeBillingDb();

    expect((await ensure(db)).productId).toBe('prod_x');
  });

  test('plano com preço lido ANTES de uma troca: não grava o produto do preço velho', async () => {
    catalogProvider(fetchMock);
    const db = createFakeBillingDb();
    db.state.plans[0].price_cents = 2490; // o banco já tem o preço novo

    const res = await ensure(db, { price_cents: 1990 }); // quem chamou leu o velho

    expect(res.productId).toBe('prod_1');
    expect(db.state.plans[0].abacate_product_id).toBeNull();
  });

  test('o SQL (contrato com o banco)', async () => {
    catalogProvider(fetchMock);
    const db = createFakeBillingDb();

    await ensure(db);

    expect(db.statements()).toMatchSnapshot();
    expect(db.query.mock.calls[0][0].values).toEqual(['prod_1', 1990, 1, 1990]);
  });
});
