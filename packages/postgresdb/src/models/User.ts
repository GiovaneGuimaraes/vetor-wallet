import { Column, CreatedAt, DataType, Default, Model, Table, Unique } from 'sequelize-typescript';

/**
 * Espelho da identidade do Cognito (T-106), não a fonte dela.
 *
 * **`password_hash` NÃO existe aqui, de propósito.** A coluna ficou morta no
 * SQLite desde a T-106 (nada lê, nada escreve) e era candidata a `DROP`. Não
 * criá-la no Postgres é o `DROP` acontecendo de graça, no único momento em que
 * ele não custa uma migração destrutiva.
 *
 * O dump anterior à carga (passo 8) continua obrigatório: ele é a única cópia
 * do que ficar para trás.
 */
@Table({ tableName: 'users', underscored: true, updatedAt: false })
export class User extends Model {
  @Unique
  @Column({ type: DataType.TEXT, allowNull: false })
  declare email: string;

  @Column({ type: DataType.TEXT })
  declare name: string | null;

  @Column({ type: DataType.TEXT })
  declare phone: string | null;

  /**
   * `sub` do Cognito. Único **quando presente** — o índice parcial do SQLite
   * vira aqui um `UNIQUE` comum, porque no Postgres vários `NULL` não colidem.
   */
  @Unique
  @Column({ type: DataType.TEXT })
  declare cognitoSub: string | null;

  /** JSON serializado, como no SQLite. Ver a nota de `jsonb` no CLAUDE.md. */
  @Default('[]')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare roles: string;

  @CreatedAt
  declare createdAt: Date;
}
