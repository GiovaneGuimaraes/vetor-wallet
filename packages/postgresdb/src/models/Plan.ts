import { Column, CreatedAt, DataType, Default, Model, Table, Unique } from 'sequelize-typescript';
import { CENTS } from '../money';

/** Catálogo global de planos — a única tabela sem `user_id`. */
@Table({ tableName: 'plans', underscored: true, updatedAt: false })
export class Plan extends Model {
  @Unique
  @Column({ type: DataType.TEXT, allowNull: false })
  declare code: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare description: string;

  /** Centavos inteiros — ver `CENTS` em `../money`. */
  @Column({ type: CENTS, allowNull: false })
  declare priceCents: number;

  @Column({ type: DataType.ENUM('monthly', 'yearly'), allowNull: false })
  declare interval: 'monthly' | 'yearly';

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare active: boolean;

  /** Produto da AbacatePay que cobra este plano no cartão (T-124a). */
  @Column({ type: DataType.TEXT })
  declare abacateProductId: string | null;

  /** Preço (centavos) com que o produto foi criado lá — o provedor não edita preço. */
  @Column({ type: CENTS })
  declare abacateProductPriceCents: number | null;

  @CreatedAt
  declare createdAt: Date;
}
