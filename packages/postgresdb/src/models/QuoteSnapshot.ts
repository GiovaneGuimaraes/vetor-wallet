import { Column, DataType, Index, Model, Table } from 'sequelize-typescript';
import { MONEY } from '../money';

/**
 * Fechamento diário por ticker (T-058a). Alimenta o gráfico valor × custo.
 *
 * **O índice único mudou de forma.** No SQLite era
 * `UNIQUE(ticker, date(captured_at))` — expressão, que só existe como índice
 * separado. No Postgres continua sendo índice de expressão, mas escrito como
 * `UNIQUE (ticker, (captured_at::date))`; o `sync` do Sequelize não gera índice
 * de expressão, então ele entra por migração explícita em `migrations/`.
 * **Sem ele não há idempotência da coleta** — dois boots no mesmo dia
 * duplicariam o fechamento.
 */
@Table({ tableName: 'quote_snapshots', underscored: true, timestamps: false })
export class QuoteSnapshot extends Model {
  @Index('idx_snapshots_ticker_time')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare ticker: string;

  @Column({ type: MONEY, allowNull: false })
  declare price: string;

  @Index('idx_snapshots_ticker_time')
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare capturedAt: Date;
}
