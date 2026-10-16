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
 * Posição de Renda Fixa manual (T-091c/d, fatia c1) — dona:
 * `@vetor-wallet/fixed-income-core`.
 *
 * `kind` e `rateType` são `ENUM`, como todo `CHECK(... IN ...)` do SQLite aqui,
 * e mudam junto com as listas do core.
 *
 * `rate` **não é dinheiro** e por isso não é `MONEY`: é percentual (% a.a., %
 * do CDI ou spread), sem limite de casas na validação da rota. `DOUBLE` é o
 * mesmo tipo do `REAL` do SQLite, então a carga dos dados não arredonda nada;
 * um `DECIMAL(p,s)` cortaria em silêncio a taxa que o usuário digitou.
 *
 * O índice composto vai em `@Table({ indexes })` com as colunas em snake_case
 * — `@Index` na propriedade ignora `underscored: true` (bug de 2026-09-22, ver
 * `CLAUDE.md` deste package).
 */
@Table({
  tableName: 'fixed_income_positions',
  underscored: true,
  updatedAt: false,
  indexes: [{ name: 'idx_fixed_income_positions_user', fields: ['user_id', 'invested_at'] }],
})
export class FixedIncomePosition extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({
    type: DataType.ENUM(
      'CAIXINHA',
      'CDB',
      'LCI',
      'LCA',
      'TESOURO',
      'DEBENTURE',
      'CRI_CRA',
      'OUTRO'
    ),
    allowNull: false,
  })
  declare kind: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare institution: string;

  @Column({ type: MONEY, allowNull: false })
  declare investedAmount: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare investedAt: string;

  @Column({ type: DataType.DATEONLY })
  declare maturityDate: string | null;

  @Column({ type: DataType.ENUM('PRE', 'CDI', 'IPCA', 'SELIC'), allowNull: false })
  declare rateType: 'PRE' | 'CDI' | 'IPCA' | 'SELIC';

  @Column({ type: DataType.DOUBLE, allowNull: false })
  declare rate: number;

  @Column({ type: MONEY })
  declare currentValue: string | null;

  @Column({ type: DataType.DATEONLY })
  declare currentValueDate: string | null;

  @CreatedAt
  declare createdAt: Date;
}
