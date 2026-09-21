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

/** Alertas: backend ativo, sem UI desde a T-026. Migra como está. */
@Table({ tableName: 'alert_rules', underscored: true, updatedAt: false })
export class AlertRule extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER })
  declare userId: number | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare ticker: string;

  @Column({
    type: DataType.ENUM('PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PCT', 'ALLOCATION_PCT'),
    allowNull: false,
  })
  declare type: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'CHANGE_PCT' | 'ALLOCATION_PCT';

  @Column({ type: MONEY, allowNull: false })
  declare threshold: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare active: boolean;

  @CreatedAt
  declare createdAt: Date;
}
