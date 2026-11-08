import type { Config } from 'jest';

/**
 * Suíte unitária do `insights-core` no formato-alvo (T-116b) — mesmo molde do
 * `alerts-core`/`portfolio-core`. Migrou de Vitest para Jest com cobertura
 * 100% travada, como os demais cores migrados.
 *
 * `rootDir` é a RAIZ DO PACKAGE: a cobertura precisa enxergar `src/`.
 *
 * `moduleNameMapper` aponta os workspace packages para o CÓDIGO-FONTE (sem
 * isso a resolução cairia no `dist/` — falso verde). `brapi-core` e
 * `portfolio-core` são mockados nos testes, mas precisam ser resolvíveis.
 */
const config: Config = {
  displayName: '@vetor-wallet/insights-core',
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
