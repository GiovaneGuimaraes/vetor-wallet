import { Column, CreatedAt, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { MONEY } from '../money';
import { User } from './User';

/**
 * Renda avulsa datada (T-036).
 *
 * `externalId` é o id da transação na origem (OFX/Pluggy) e sustenta a dedupe
 * de importação (T-084). O índice único é **parcial** — `WHERE external_id IS
 * NOT NULL` —, porque lançamento digitado à mão não tem origem externa e vários
 * `NULL` não podem colidir. No Postgres o `UNIQUE` comum já ignora `NULL`, mas
 * o índice parcial continua valendo a pena: ele não indexa as linhas manuais.
 * Entra por migração explícita (o `sync` não gera índice parcial).
 */
@Table({
  tableName: 'income_entries',
  underscored: true,
  updatedAt: false,
  indexes: [{ name: 'idx_income_entries_user_date', fields: ['user_id', 'date'] }],
})
export class IncomeEntry extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare description: string;

  @Column({ type: MONEY, allowNull: false })
  declare amount: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare date: string;

  @Column({ type: DataType.TEXT })
  declare externalId: string | null;

  @CreatedAt
  declare createdAt: Date;
}
