import type { Config } from 'jest';

/**
 * Suíte unitária do `portfolio-core` no formato-alvo — mesmo molde do
 * `alerts-core`/`operations-core` (T-104).
 *
 * Desde a fatia 2/2 da migração o package INTEIRO está aqui: não há mais
 * Vitest nem `src/*.test.ts`, e a trava de 100% vale para todo `src/` — só o
 * barrel fica de fora (não tem lógica).
 *
 * `rootDir` é a RAIZ DO PACKAGE: a cobertura precisa enxergar `src/`, e os
 * testes importam por `src/...` para deixar explícito que olham de fora.
 *
 * `moduleNameMapper` aponta os workspace packages para o CÓDIGO-FONTE (sem isso
 * a resolução cairia no `dist/` — falso verde). `@vetor-wallet/query` entra só pelo
 * TIPO `Query` (T-114): o client é injetado, e o teste passa o mock de
 * `tests/unit/testQuery.ts`.
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
    '^@vetor-wallet/query$': '<rootDir>/../query/src/index.ts',
    '^@vetor-wallet/shared$': '<rootDir>/../shared/src/index.ts',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^tests/(.*)$': '<rootDir>/tests/$1',
  },
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: ['<rootDir>/src/**/*.ts', '!<rootDir>/src/index.ts'],
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
