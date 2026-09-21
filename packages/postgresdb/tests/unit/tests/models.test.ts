import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
import * as models from 'src/models';

/**
 * O schema é declarativo, e é aí que o erro passa despercebido: um `tableName`
 * errado, uma coluna de dinheiro que ficou em ponto flutuante, um `UNIQUE` que
 * não foi declarado. Nada disso quebra build nem tipo — quebra em produção.
 *
 * Estes testes leem os modelos SEM conectar em banco nenhum: o Sequelize
 * resolve os atributos no registro dos modelos, e é isso que se afirma aqui.
 */
const sequelize = new Sequelize({
  dialect: 'postgres',
  models: Object.values(models),
  logging: false,
});

type Attrs = Record<
  string,
  { type: unknown; allowNull?: boolean; unique?: unknown; primaryKey?: boolean }
>;

function attrs(model: { getAttributes(): unknown }): Attrs {
  return model.getAttributes() as Attrs;
}

describe('schema do Postgres', () => {
  it('modela as 19 tabelas vivas', () => {
    expect(Object.keys(models)).toHaveLength(19);
  });

  it('cada modelo aponta para a tabela com o nome que o SQLite já usa', () => {
    const esperado: Record<string, string> = {
      User: 'users',
      Wallet: 'wallets',
      Operation: 'operations',
      AlertRule: 'alert_rules',
      QuoteSnapshot: 'quote_snapshots',
      IncomeSource: 'income_sources',
      IncomeEntry: 'income_entries',
      FixedExpense: 'fixed_expenses',
      ExpenseEntry: 'expense_entries',
      RecurringExpense: 'recurring_expenses',
      RecurringExpenseMonth: 'recurring_expense_months',
      SavingsEntry: 'savings_entries',
      CategoryBudget: 'category_budgets',
      Plan: 'plans',
      Subscription: 'subscriptions',
      PixCharge: 'pix_charges',
      BillingWebhookEvent: 'billing_webhook_events',
      PluggyItem: 'pluggy_items',
      Session: 'sessions',
    };
    for (const [nome, tabela] of Object.entries(esperado)) {
      expect(models[nome as keyof typeof models].getTableName()).toBe(tabela);
    }
  });

  it('users NAO tem password_hash — a coluna morta não atravessa a migração', () => {
    expect(Object.keys(attrs(models.User))).not.toContain('passwordHash');
  });

  it('não existe modelo para hourly_quote_insights (tabela sem leitor, T-109a)', () => {
    const tabelas = Object.values(models).map((m) => m.getTableName());
    expect(tabelas).not.toContain('hourly_quote_insights');
  });

  it('savings_entries não tem goal_id — Metas saiu na T-091b1/b2', () => {
    expect(Object.keys(attrs(models.SavingsEntry))).not.toContain('goalId');
  });

  it('toda coluna de dinheiro é DECIMAL(14,2), nunca ponto flutuante', () => {
    const dinheiro: Array<[keyof typeof models, string]> = [
      ['Operation', 'price'],
      ['Operation', 'quantity'],
      ['AlertRule', 'threshold'],
      ['QuoteSnapshot', 'price'],
      ['IncomeSource', 'amount'],
      ['IncomeEntry', 'amount'],
      ['FixedExpense', 'amount'],
      ['ExpenseEntry', 'amount'],
      ['RecurringExpense', 'amount'],
      ['SavingsEntry', 'amount'],
      ['CategoryBudget', 'amount'],
    ];
    for (const [nome, coluna] of dinheiro) {
      expect(String(attrs(models[nome])[coluna].type)).toBe('DECIMAL(14,2)');
    }
  });

  it('dinheiro em centavos continua inteiro (plans e pix_charges)', () => {
    expect(String(attrs(models.Plan).priceCents.type)).toBe('INTEGER');
    expect(String(attrs(models.PixCharge).amountCents.type)).toBe('INTEGER');
  });

  it('as unicidades que seguram corrida estão declaradas', () => {
    expect(attrs(models.User).email.unique).toBeTruthy();
    expect(attrs(models.User).cognitoSub.unique).toBeTruthy();
    expect(attrs(models.Plan).code.unique).toBeTruthy();
    expect(attrs(models.PixCharge).abacateChargeId.unique).toBeTruthy();
    expect(attrs(models.BillingWebhookEvent).eventId.unique).toBeTruthy();
    expect(attrs(models.PluggyItem).itemId.unique).toBeTruthy();
  });

  it('o UNIQUE(recurring_id, month) — a trava da corrida da T-035 — existe', () => {
    const indices = models.RecurringExpenseMonth.options.indexes ?? [];
    expect(indices).toContainEqual(
      expect.objectContaining({ unique: true, fields: ['recurring_id', 'month'] })
    );
  });

  it('o UNIQUE(user_id, category) do orçamento existe', () => {
    const indices = models.CategoryBudget.options.indexes ?? [];
    expect(indices).toContainEqual(
      expect.objectContaining({ unique: true, fields: ['user_id', 'category'] })
    );
  });

  it('sessions não tem timestamps automáticos e é chaveada pelo sid', () => {
    expect(Object.keys(attrs(models.Session))).not.toContain('createdAt');
    expect(attrs(models.Session).sid.primaryKey).toBe(true);
  });

  afterAll(async () => {
    await sequelize.close().catch(() => undefined);
  });
});
