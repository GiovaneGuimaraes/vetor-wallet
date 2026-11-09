import {
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  Model,
  Table,
  Unique,
} from 'sequelize-typescript';
import { User } from './User';

/**
 * Cliente do usuário na AbacatePay (T-124a), criado só na assinatura no cartão.
 *
 * Fora de `users` porque `users` pertence ao `auth-core`. Único nos dois lados:
 * um usuário tem um cliente, e um cliente do provedor é de um usuário só.
 */
@Table({ tableName: 'billing_customers', underscored: true, updatedAt: false })
export class BillingCustomer extends Model {
  @Unique('idx_billing_customers_user')
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Unique('idx_billing_customers_abacate_id')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare abacateCustomerId: string;

  @CreatedAt
  declare createdAt: Date;
}
