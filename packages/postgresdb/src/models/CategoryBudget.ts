import { Column, CreatedAt, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { MONEY } from '../money';
import { User } from './User';

/** Teto por categoria, sem vínculo com mês. Um por (usuário × categoria). */
@Table({
  tableName: 'category_budgets',
  underscored: true,
  updatedAt: false,
  indexes: [
    { name: 'idx_category_budgets_user_category', unique: true, fields: ['user_id', 'category'] },
  ],
})
export class CategoryBudget extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare category: string;

  @Column({ type: MONEY, allowNull: false })
  declare amount: string;

  @CreatedAt
  declare createdAt: Date;
}
