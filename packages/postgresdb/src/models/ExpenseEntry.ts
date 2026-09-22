import {
  Column,
  CreatedAt,
  DataType,
  Default,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { MONEY } from '../money';
import { RecurringExpense } from './RecurringExpense';
import { User } from './User';

/**
 * Despesa variável datada — e também a ocorrência materializada de uma
 * recorrência, quando `recurringId` está preenchido.
 *
 * `externalId` sustenta a dedupe de importação (T-084); ver `IncomeEntry`.
 */
@Table({
  tableName: 'expense_entries',
  underscored: true,
  updatedAt: false,
  indexes: [{ name: 'idx_expense_entries_user_date', fields: ['user_id', 'date'] }],
})
export class ExpenseEntry extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare description: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare category: string;

  @Column({ type: MONEY, allowNull: false })
  declare amount: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare date: string;

  @ForeignKey(() => RecurringExpense)
  @Column({ type: DataType.INTEGER })
  declare recurringId: number | null;

  @Column({ type: DataType.TEXT })
  declare externalId: string | null;

  @CreatedAt
  declare createdAt: Date;
}
