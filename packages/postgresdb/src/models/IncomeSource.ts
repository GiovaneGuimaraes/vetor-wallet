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

/** Fonte de renda fixa mensal, sem data. */
@Table({ tableName: 'income_sources', underscored: true, updatedAt: false })
export class IncomeSource extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Default('OUTRO')
  @Column({ type: DataType.ENUM('SALARIO', 'FREELA', 'OUTRO'), allowNull: false })
  declare type: 'SALARIO' | 'FREELA' | 'OUTRO';

  @Column({ type: MONEY, allowNull: false })
  declare amount: string;

  @CreatedAt
  declare createdAt: Date;
}
