import {
  Column,
  CreatedAt,
  DataType,
  Default,
  ForeignKey,
  Model,
  Table,
  Unique,
} from 'sequelize-typescript';
import { Plan } from './Plan';
import { User } from './User';

export type SubscriptionCheckoutStatus =
  | 'CREATING'
  | 'OPEN'
  | 'COMPLETED'
  | 'SUPERSEDED'
  | 'FAILED';

/**
 * Checkout de assinatura no cartão (T-124a): para o cartão, o papel que
 * `pix_charges` faz para o Pix — o dono vem daqui, nunca do payload.
 *
 * A trava "no máximo um checkout aberto por usuário" é um índice PARCIAL
 * (`WHERE status IN ('CREATING','OPEN')`). Ao contrário do que vale para os
 * parciais do SQLite listados no `CLAUDE.md` (que viraram `UNIQUE` comum),
 * este é CORREÇÃO, não otimização: sem o `WHERE`, o histórico de checkouts
 * concluídos colidiria. O `where` em `@Table({ indexes })` sai no `sync` —
 * provado em `ddl.test.ts` pelo `addIndexQuery`.
 */
@Table({
  tableName: 'subscription_checkouts',
  underscored: true,
  updatedAt: false,
  indexes: [
    {
      name: 'idx_subscription_checkouts_user_open',
      unique: true,
      fields: ['user_id'],
      where: { status: ['CREATING', 'OPEN'] },
    },
  ],
})
export class SubscriptionCheckout extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @ForeignKey(() => Plan)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare planId: number;

  /** `bill_…`. Nulo enquanto CREATING; no Postgres vários NULL não colidem. */
  @Unique('idx_subscription_checkouts_abacate_id')
  @Column({ type: DataType.TEXT })
  declare abacateCheckoutId: string | null;

  @Column({ type: DataType.TEXT })
  declare checkoutUrl: string | null;

  @Default('CREATING')
  @Column({
    type: DataType.ENUM('CREATING', 'OPEN', 'COMPLETED', 'SUPERSEDED', 'FAILED'),
    allowNull: false,
  })
  declare status: SubscriptionCheckoutStatus;

  /** `subs_…`, só depois do pagamento. */
  @Column({ type: DataType.TEXT })
  declare abacateSubscriptionId: string | null;

  @CreatedAt
  declare createdAt: Date;

  @Column({ type: DataType.DATE })
  declare completedAt: Date | null;
}
