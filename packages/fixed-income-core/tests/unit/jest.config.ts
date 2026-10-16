import type { Config } from 'jest';

/**
 * Suíte unitária do `fixed-income-core` — molde do `savings-core`.
 *
 * `rootDir` é a RAIZ DO PACKAGE (dois níveis acima deste arquivo): a cobertura
 * precisa enxergar `src/`, e os testes importam por `src/...` de fora.
 *
 * `moduleNameMapper` aponta os workspace packages para o CÓDIGO-FONTE — sem
 * isso a resolução cairia no `dist/` do package.json (falso verde com build
 * antigo). `@vetor-wallet/query` entra só pelo TIPO `Query`: o client é
 * injetado e o teste passa o mock de `tests/unit/testQuery.ts`.
 */
const config: Config = {
  displayName: '@vetor-wallet/fixed-income-core',
  rootDir: '../..',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
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
