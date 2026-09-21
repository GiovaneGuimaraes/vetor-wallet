import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
import * as models from './models';

export interface InitializeOptions {
  /** Sobrepõe as variáveis de ambiente — usado pelo teste de integração. */
  url?: string;
  /** `true` aplica o schema (`sequelize.sync`). Default: não aplica. */
  sync?: boolean;
  /** `alter` reconcilia tabelas existentes; sem ele, só cria o que falta. */
  alter?: boolean;
  logging?: boolean;
}

let sequelize: Sequelize | undefined;

/**
 * A URL de conexão, montada das mesmas variáveis que o Lambda de query usa.
 *
 * `DATABASE_URL` inteira ganha das partes — é o que o container local e o
 * CI usam. As partes existem porque o Secrets Manager entrega assim.
 */
export function resolveDatabaseUrl(): string {
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;

  const user = process.env.DATABASE_USERNAME ?? 'vetor';
  const password = process.env.DATABASE_PASSWORD ?? 'vetor';
  const host = process.env.DATABASE_HOST ?? 'localhost';
  const port = process.env.DATABASE_PORT ?? '5433';
  const name = process.env.DATABASE_NAME ?? 'vetor_wallet';

  return `postgres://${user}:${password}@${host}:${port}/${name}`;
}

/**
 * Conecta (e opcionalmente aplica o schema), devolvendo a instância e os
 * modelos — no molde do `@ttoss/postgresdb`.
 *
 * O singleton é deliberado: várias chamadas no mesmo processo reusam a
 * conexão. **Este package não é usado em request de app** — quem atende
 * request é `@vetor-wallet/query`, que fala SQL. Aqui é DDL e ferramenta:
 * `db:sync`, testes de integração e, mais tarde, a carga dos dados.
 */
export async function initialize(options: InitializeOptions = {}) {
  if (!sequelize) {
    sequelize = new Sequelize(options.url ?? resolveDatabaseUrl(), {
      dialect: 'postgres',
      logging: options.logging ? console.log : false,
      define: { underscored: true },
      models: Object.values(models),
    });
  }

  await sequelize.authenticate();

  if (options.sync) {
    await sequelize.sync({ alter: options.alter ?? false });
  }

  return { sequelize, ...models };
}

/** Fecha a conexão e esquece o singleton (o teste precisa dos dois). */
export async function close(): Promise<void> {
  if (sequelize) {
    await sequelize.close();
    sequelize = undefined;
  }
}
