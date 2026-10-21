import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
import * as models from 'src/models';

/**
 * O DDL que o Sequelize vai emitir, gerado **sem conectar em banco nenhum**.
 *
 * Este é o teste que pega o erro que nenhum outro pega: o `timestamps: true` é
 * o default do Sequelize e adiciona `updated_at` sozinho. Na primeira versão
 * deste package isso criou a coluna em 14 tabelas que **não a têm** no SQLite —
 * um schema silenciosamente diferente do que a migração de dados esperaria.
 * O teste de atributos passava; só o DDL mostrou.
 */
const sequelize = new Sequelize({
  dialect: 'postgres',
  models: Object.values(models),
  logging: false,
});

type Generator = {
  attributesToSQL(attrs: unknown, options: unknown): unknown;
  createTableQuery(table: unknown, attrs: unknown, options: unknown): string;
};

function ddl(model: { getAttributes(): unknown; getTableName(): unknown }): string {
  const qg = (sequelize.getQueryInterface() as unknown as { queryGenerator: Generator })
    .queryGenerator;
  const attrs = qg.attributesToSQL(model.getAttributes(), { table: model.getTableName() });
  return qg.createTableQuery(model.getTableName(), attrs, {});
}

describe('DDL gerado', () => {
  it('nenhuma tabela ganha updated_at que o app não tem', () => {
    const comUpdatedAt = ['subscriptions', 'pluggy_items'];
    for (const model of Object.values(models)) {
      const sql = ddl(model);
      const tabela = String(model.getTableName());
      if (comUpdatedAt.includes(tabela)) {
        expect(sql).toContain('"updated_at"');
      } else {
        expect(sql).not.toContain('"updated_at"');
      }
    }
  });

  it('as tabelas cuja data é coluna própria não ganham created_at', () => {
    expect(ddl(models.QuoteSnapshot)).not.toContain('"created_at"');
    expect(ddl(models.QuoteSnapshot)).toContain('"captured_at"');
    expect(ddl(models.BillingWebhookEvent)).not.toContain('"created_at"');
    expect(ddl(models.BillingWebhookEvent)).toContain('"received_at"');
  });

  it('dinheiro sai como DECIMAL(14,2) no SQL, não como double', () => {
    const sql = ddl(models.SavingsEntry);
    expect(sql).toContain('"amount" DECIMAL(14,2) NOT NULL');
    expect(sql).not.toContain('DOUBLE');
    expect(sql).not.toContain('FLOAT');
  });

  it('data do usuário sai como DATE, e chave de mês como TEXT', () => {
    expect(ddl(models.SavingsEntry)).toContain('"date" DATE NOT NULL');
    expect(ddl(models.RecurringExpenseMonth)).toContain('"month" TEXT NOT NULL');
  });

  it('a chave primária é SERIAL em todas, menos sessions (chaveada pelo sid)', () => {
    for (const model of Object.values(models)) {
      const sql = ddl(model);
      if (String(model.getTableName()) === 'sessions') {
        expect(sql).toContain('PRIMARY KEY ("sid")');
      } else {
        expect(sql).toContain('SERIAL');
      }
    }
  });

  it('o CHECK de tipo vira ENUM do Postgres, não texto livre', () => {
    expect(ddl(models.SavingsEntry)).toContain('enum_savings_entries_type');
    expect(ddl(models.Operation)).toContain('enum_operations_type');
  });

  it('fixed_income_positions: ENUMs, dinheiro exato, datas DATE e opcionais nulos (T-091c/d)', () => {
    const sql = ddl(models.FixedIncomePosition);
    expect(sql).toContain('enum_fixed_income_positions_kind');
    expect(sql).toContain('enum_fixed_income_positions_rate_type');
    expect(sql).toContain('"invested_amount" DECIMAL(14,2) NOT NULL');
    expect(sql).toMatch(/"current_value" DECIMAL\(14,2\)(,| )/);
    expect(sql).not.toContain('"current_value" DECIMAL(14,2) NOT NULL');
    expect(sql).toContain('"invested_at" DATE NOT NULL');
    expect(sql).toMatch(/"maturity_date" DATE(,| )/);
    expect(sql).not.toContain('"maturity_date" DATE NOT NULL');
    expect(sql).toMatch(/"current_value_date" DATE(,| )/);
    expect(sql).toContain('"institution" TEXT NOT NULL DEFAULT \'\'');
    // Taxa é percentual, não dinheiro: DOUBLE espelha o REAL do SQLite sem
    // arredondar na carga.
    expect(sql).toContain('"rate" DOUBLE PRECISION NOT NULL');
    expect(sql).toContain('"user_id" INTEGER NOT NULL');
  });

  it('fixed_income_positions.superseded_by_pluggy_investment_id: TEXT anulável, sem FK nem UNIQUE (T-091d, d3a)', () => {
    const sql = ddl(models.FixedIncomePosition);
    expect(sql).toMatch(/"superseded_by_pluggy_investment_id" TEXT(,| |\))/);
    expect(sql).not.toMatch(/"superseded_by_pluggy_investment_id" TEXT NOT NULL/);
    expect(sql).not.toMatch(
      /"superseded_by_pluggy_investment_id" TEXT[^,]*(UNIQUE|REFERENCES|DEFAULT)/
    );
    expect(sql).not.toContain('supersededByPluggyInvestmentId');
    // Nenhum índice declarado no modelo cobre a coluna.
    for (const index of models.FixedIncomePosition.options.indexes ?? []) {
      expect(JSON.stringify(index.fields)).not.toContain('superseded');
    }
  });

  it('o índice composto de fixed_income_positions usa as colunas em snake_case', () => {
    // `@Index` na propriedade geraria `"userId"` e o Postgres recusaria (bug de
    // 2026-09-22). Aqui o índice vem de `@Table({ indexes })`.
    const qi = sequelize.getQueryInterface() as unknown as {
      queryGenerator: {
        addIndexQuery(table: string, options: unknown, raw?: string): string;
      };
    };
    const [index] = models.FixedIncomePosition.options.indexes ?? [];
    expect(index).toEqual(
      expect.objectContaining({
        name: 'idx_fixed_income_positions_user',
        fields: ['user_id', 'invested_at'],
      })
    );
    const sql = qi.queryGenerator.addIndexQuery('fixed_income_positions', index);
    expect(sql).toContain('("user_id", "invested_at")');
    expect(sql).not.toContain('userId');
  });

  afterAll(async () => {
    await sequelize.close().catch(() => undefined);
  });
});
