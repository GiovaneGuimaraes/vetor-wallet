import { Column, DataType, Index, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sessão do `express-session` (T-034/T-046).
 *
 * **Só existe se a decisão 3 for "trocar o store"** (§6.1 do
 * `plano-migracao-aws.md`). Se a sessão virar JWT validado no API Gateway, esta
 * tabela não nasce e o modelo sai daqui.
 *
 * Está modelada desde já porque é a opção recomendada para a fase 2, e porque
 * ter a tabela sem usá-la não custa nada — o contrário (descobrir na hora que
 * ela falta) custaria um deploy.
 */
@Table({ tableName: 'sessions', underscored: true, timestamps: false })
export class Session extends Model {
  @PrimaryKey
  @Column({ type: DataType.TEXT })
  declare sid: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare data: string;

  @Index('idx_sessions_expires_at')
  @Column({ type: DataType.DATE, allowNull: false })
  declare expiresAt: Date;
}
