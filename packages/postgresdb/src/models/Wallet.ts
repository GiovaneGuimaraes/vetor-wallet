import {
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  Default,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from './User';

/** Carteira de ações. **Uma por usuário** (T-050) — a regra vive na rota. */
@Table({ tableName: 'wallets', underscored: true, updatedAt: false })
export class Wallet extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @BelongsTo(() => User)
  declare user?: User;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare description: string;

  @Default('#e3d5b8')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare color: string;

  @CreatedAt
  declare createdAt: Date;
}
