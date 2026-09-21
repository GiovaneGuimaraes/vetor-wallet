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

/**
 * Lançamento de poupança. `goalId` **não existe** — Metas saiu na T-091b1 e o
 * dado foi apagado na T-091b2.
 *
 * `transferGroup` é o que sobrou daquela época (T-041): procedência para o selo
 * `⇄` da UI. Perna de par legado conta **integral** no saldo.
 */
@Table({ tableName: 'savings_entries', underscored: true, updatedAt: false })
export class SavingsEntry extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.ENUM('DEPOSIT', 'WITHDRAW', 'YIELD'), allowNull: false })
  declare type: 'DEPOSIT' | 'WITHDRAW' | 'YIELD';

  @Column({ type: MONEY, allowNull: false })
  declare amount: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare date: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare note: string;

  @Column({ type: DataType.TEXT })
  declare transferGroup: string | null;

  @CreatedAt
  declare createdAt: Date;
}
