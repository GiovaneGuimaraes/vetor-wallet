import type { Config } from 'jest';

/**
 * Suíte unitária do `portfolio-core` no formato-alvo — mesmo molde do
 * `alerts-core`/`operations-core` (T-104).
 *
 * **Package em transição (T-104, fatia 1/2).** Só a matemática de posição e a
 * carteira única já migraram; `snapshots.ts` e `portfolioHistory.ts` seguem no
 * formato antigo, com teste Vitest ao lado em `src/`. Por isso:
 * - `collectCoverageFrom` lista os arquivos MIGRADOS por exclusão dos dois
 *   antigos — a trava de 100% vale só para o que já está no formato. Quando a
 *   fatia 2 migrar os dois, as exclusões saem daqui e o `vitest run` sai do
 *   script `test`.
 * - `roots` aponta só para `tests/unit/tests`, então o Jest nunca pega um
 *   `src/*.test.ts` do Vitest por engano.
 *
 * `rootDir` é a RAIZ DO PACKAGE: a cobertura precisa enxergar `src/`, e os
 * testes importam por `src/...` para deixar explícito que olham de fora.
 *
 * `moduleNameMapper` aponta os workspace packages para o CÓDIGO-FONTE (sem isso
 * a resolução cairia no `dist/` — falso verde). `@vetor-wallet/db` entra só pelo
 * TIPO `Db`: nenhuma função migrada importa o singleton.
 */
const config: Config = {
  displayName: '@vetor-wallet/portfolio-core',
  rootDir: '../..',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit/tests'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@vetor-wallet/db$': '<rootDir>/../db/src/index.ts',
    '^@vetor-wallet/shared$': '<rootDir>/../shared/src/index.ts',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^tests/(.*)$': '<rootDir>/tests/$1',
  },
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/index.ts',
    '!<rootDir>/src/**/*.test.ts',
    // Formato antigo — fatia 2/2 da T-104.
    '!<rootDir>/src/snapshots.ts',
    '!<rootDir>/src/portfolioHistory.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: {
      functions: 100,
      lines: 100,
      statements: 100,
      branches: 100,
    },
  },
};

export default config;
