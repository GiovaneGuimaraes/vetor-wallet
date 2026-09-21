import {
  Column,
  CreatedAt,
  DataType,
  Default,
  ForeignKey,
  Model,
  Table,
  Unique,
  UpdatedAt,
} from 'sequelize-typescript';
import { Plan } from './Plan';
import { User } from './User';

/** Assinatura do usuário. Uma por usuário (índice único). */
@Table({ tableName: 'subscriptions', underscored: true })
export class Subscription extends Model {
  @Unique('idx_subscriptions_user')
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @ForeignKey(() => Plan)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare planId: number;

  @Default('pending')
  @Column({
    type: DataType.ENUM('pending', 'active', 'expired', 'canceled'),
    allowNull: false,
  })
  declare status: 'pending' | 'active' | 'expired' | 'canceled';

  /**
   * Fim do período pago. O `subscription-core` grava **datas UTC no formato do
   * SQLite** (`YYYY-MM-DD HH:MM:SS`) e compara por string. Com `TIMESTAMPTZ` a
   * comparação passa a ser de instante, o que é mais correto — e é uma das
   * mudanças a provar no passo 5, porque hoje há teste que depende do formato.
   */
  @Column({ type: DataType.DATE })
  declare currentPeriodEnd: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
