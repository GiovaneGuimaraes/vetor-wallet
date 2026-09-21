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

/** Despesa fixa mensal, sem data. Categoria já chega normalizada (T-028). */
@Table({ tableName: 'fixed_expenses', underscored: true, updatedAt: false })
export class FixedExpense extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare category: string;

  @Column({ type: MONEY, allowNull: false })
  declare amount: string;

  @CreatedAt
  declare createdAt: Date;
}
