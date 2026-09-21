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
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './User';

/**
 * Conexão de Open Finance de um usuário (T-089a).
 *
 * `itemId` é identificador da Pluggy. **Nada dele entra em arquivo versionado**
 * — nem em fixture, nem em log de PR (regra do `CLAUDE.md`: o repo é público).
 */
@Table({ tableName: 'pluggy_items', underscored: true })
export class PluggyItem extends Model {
  @Index('idx_pluggy_items_user')
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Unique
  @Column({ type: DataType.TEXT, allowNull: false })
  declare itemId: string;

  @Column({ type: DataType.INTEGER })
  declare connectorId: number | null;

  @Column({ type: DataType.TEXT })
  declare connectorName: string | null;

  @Default('UNKNOWN')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Index('idx_pluggy_items_user')
  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
