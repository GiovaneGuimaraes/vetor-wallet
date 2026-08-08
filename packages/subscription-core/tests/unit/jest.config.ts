import type { Config } from 'jest';

/**
 * Suíte unitária do `subscription-core`.
 *
 * `rootDir` é a RAIZ DO PACKAGE (dois níveis acima deste arquivo), não esta
 * pasta: a cobertura precisa enxergar `src/`, e os testes importam por
 * `src/...` justamente para deixar explícito que estão de fora olhando para
 * dentro.
 *
 * `moduleNameMapper` aponta os workspace packages para o CÓDIGO-FONTE. Sem isso
 * a resolução cairia no `main` (`dist/index.js`) do package.json, que pode não
 * existir ou estar desatualizado — a suíte passaria a validar um build antigo
 * (falso verde). É o mesmo motivo do `resolve.alias` nos `vitest.config.ts` do
 * resto do monorepo.
 */
const config: Config = {
  displayName: '@vetor-wallet/subscription-core',
  rootDir: '../..',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit/tests'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tests/tsconfig.json', isolatedModules: true },
    ],
  },
  moduleNameMapper: {
    '^@vetor-wallet/db$': '<rootDir>/../db/src/index.ts',
    '^@vetor-wallet/shared$': '<rootDir>/../shared/src/index.ts',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^tests/(.*)$': '<rootDir>/tests/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/unit/setupTests.ts'],
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
