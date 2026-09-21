import { Column, CreatedAt, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { RecurringExpense } from './RecurringExpense';

/**
 * Livro-razão de "meses já gerados" de cada recorrência (T-035).
 *
 * **É esta tabela — e não a existência da ocorrência — que torna a
 * materialização idempotente.** A linha sobrevive ao `DELETE` da ocorrência,
 * então excluir um lançamento gerado não o recria no próximo GET.
 *
 * O `UNIQUE(recurring_id, month)` é a trava da corrida entre dois GETs
 * simultâneos do mesmo mês; **é o índice mais importante do schema inteiro**,
 * e o único cuja ausência produz duplicata silenciosa em vez de erro.
 */
@Table({
  tableName: 'recurring_expense_months',
  underscored: true,
  updatedAt: false,
  indexes: [
    {
      name: 'idx_recurring_expense_months_unique',
      unique: true,
      fields: ['recurring_id', 'month'],
    },
  ],
})
export class RecurringExpenseMonth extends Model {
  @ForeignKey(() => RecurringExpense)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare recurringId: number;

  /** `YYYY-MM`. */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare month: string;

  @CreatedAt
  declare createdAt: Date;
}
