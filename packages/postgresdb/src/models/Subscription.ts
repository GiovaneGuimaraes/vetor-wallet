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

  /**
   * T-124a. NULL = Pix legado; futuros 'pix_legacy' | 'abacatepay_card'. TEXT,
   * não ENUM: no SQLite a coluna entrou sem CHECK (CHECK novo exigiria rebuild)
   * e o vocabulário ainda não foi fixado pela regra (T-124b1).
   */
  @Column({ type: DataType.TEXT })
  declare provider: string | null;

  /** `subs_…` da AbacatePay. Único quando presente. */
  @Unique('idx_subscriptions_abacate_id')
  @Column({ type: DataType.TEXT })
  declare abacateSubscriptionId: string | null;

  /** Status cru do provedor (ACTIVE/CANCELLED/…). */
  @Column({ type: DataType.TEXT })
  declare providerStatus: string | null;

  @Column({ type: DataType.DATE })
  declare canceledAt: Date | null;

  @Column({ type: DataType.DATE })
  declare lastSyncedAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
