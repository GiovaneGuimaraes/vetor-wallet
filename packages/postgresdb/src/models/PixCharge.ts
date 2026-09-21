import {
  Column,
  CreatedAt,
  DataType,
  Default,
  ForeignKey,
  Index,
  Model,
  Table,
  Unique,
} from 'sequelize-typescript';
import { CENTS } from '../money';
import { Plan } from './Plan';
import { User } from './User';

/** Cobrança Pix na AbacatePay. `id` é LOCAL; `abacateChargeId` é o do provedor. */
@Table({ tableName: 'pix_charges', underscored: true, updatedAt: false })
export class PixCharge extends Model {
  @Index('idx_pix_charges_user_status')
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @ForeignKey(() => Plan)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare planId: number;

  @Unique
  @Column({ type: DataType.TEXT, allowNull: false })
  declare abacateChargeId: string;

  @Column({ type: CENTS, allowNull: false })
  declare amountCents: number;

  @Index('idx_pix_charges_user_status')
  @Default('PENDING')
  @Column({
    type: DataType.ENUM('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED'),
    allowNull: false,
  })
  declare status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED';

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare brCode: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare brCodeBase64: string;

  @Column({ type: DataType.DATE })
  declare expiresAt: Date | null;

  @Column({ type: DataType.DATE })
  declare paidAt: Date | null;

  @Index('idx_pix_charges_user_status')
  @CreatedAt
  declare createdAt: Date;
}
