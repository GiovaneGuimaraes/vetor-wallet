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
import { User } from './User';

/**
 * Template de despesa que se repete todo mês (T-035). As ocorrências são
 * `expense_entries` normais com `recurringId` — editáveis e excluíveis uma a
 * uma, e contando nos totais sem caso especial.
 */
@Table({
  tableName: 'recurring_expenses',
  underscored: true,
  updatedAt: false,
  indexes: [{ name: 'idx_recurring_expenses_user_active', fields: ['user_id', 'active'] }],
})
export class RecurringExpense extends Model {
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

  /** 1..31; o `CHECK` do SQLite vira `CHECK` do Postgres, via migração. */
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare dayOfMonth: number;

  /** `YYYY-MM` — chave de mês, não data. Continua texto. */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare startMonth: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare active: boolean;

  @Column({ type: DataType.DATE })
  declare endedAt: Date | null;

  @CreatedAt
  declare createdAt: Date;
}
