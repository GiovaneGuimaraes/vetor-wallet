import { close, initialize, resolveDatabaseUrl } from './initialize';

/**
 * `pnpm --filter @vetor-wallet/postgresdb db:sync` — aplica o schema no
 * Postgres local.
 *
 * **Não é migração de produção.** `sync` cria o que falta e, com `--alter`,
 * reconcilia o que existe; para a Aurora o caminho é migração versionada.
 * Aqui ele serve o ciclo de desenvolvimento: subir o container, aplicar, rodar.
 */
async function main() {
  const alter = process.argv.includes('--alter');
  const url = resolveDatabaseUrl();
  // A URL traz senha: loga só o host e o banco.
  const { host, pathname } = new URL(url);
  console.log(`[postgresdb] aplicando schema em ${host}${pathname} (alter=${alter})`);

  await initialize({ sync: true, alter, logging: process.argv.includes('--verbose') });
  console.log('[postgresdb] schema aplicado');
  await close();
}

main().catch((err) => {
  console.error('[postgresdb] falhou:', err);
  process.exit(1);
});
