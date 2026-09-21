import { Column, DataType, Default, Model, Table, Unique } from 'sequelize-typescript';

/**
 * Livro de eventos já processados do webhook da AbacatePay.
 *
 * O `UNIQUE(event_id)` é a idempotência: o mesmo evento reentregue não ativa a
 * assinatura duas vezes. Como no `recurring_expense_months`, a violação é
 * **sinal**, não erro.
 */
@Table({ tableName: 'billing_webhook_events', underscored: true, timestamps: false })
export class BillingWebhookEvent extends Model {
  @Unique
  @Column({ type: DataType.TEXT, allowNull: false })
  declare eventId: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare eventType: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare chargeId: string;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false })
  declare receivedAt: Date;
}
