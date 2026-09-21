import { Column, CreatedAt, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { MONEY } from '../money';
import { User } from './User';
import { Wallet } from './Wallet';

/**
 * Compra ou venda de ação. `quantity` também é `NUMERIC`: fração de ação
 * existe (bonificação, grupamento) e `REAL` já a guardava.
 */
@Table({ tableName: 'operations', underscored: true, updatedAt: false })
export class Operation extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER })
  declare userId: number | null;

  @ForeignKey(() => Wallet)
  @Column({ type: DataType.INTEGER })
  declare walletId: number | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare ticker: string;

  @Column({ type: DataType.ENUM('BUY', 'SELL'), allowNull: false })
  declare type: 'BUY' | 'SELL';

  @Column({ type: MONEY, allowNull: false })
  declare quantity: string;

  @Column({ type: MONEY, allowNull: false })
  declare price: string;

  /** `DATEONLY` devolve `YYYY-MM-DD` — o mesmo texto que a API já expõe. */
  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare date: string;

  @CreatedAt
  declare createdAt: Date;
}
