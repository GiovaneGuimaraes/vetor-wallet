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

  afterAll(async () => {
    await sequelize.close().catch(() => undefined);
  });
});
