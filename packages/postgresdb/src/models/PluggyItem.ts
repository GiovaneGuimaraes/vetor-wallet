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
import { User } from './User';

/**
 * Conexão de Open Finance de um usuário (T-089a).
 *
 * `itemId` é identificador da Pluggy. **Nada dele entra em arquivo versionado**
 * — nem em fixture, nem em log de PR (regra do `CLAUDE.md`: o repo é público).
 */
@Table({
  tableName: 'pluggy_items',
  underscored: true,
  indexes: [{ name: 'idx_pluggy_items_user', fields: ['user_id', 'created_at'] }],
})
export class PluggyItem extends Model {
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

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
