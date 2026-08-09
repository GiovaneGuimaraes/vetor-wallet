import type { Config } from 'jest';

/**
 * Suíte unitária do `validation-core`.
 *
 * `rootDir` é a RAIZ DO PACKAGE (dois níveis acima deste arquivo), não esta
 * pasta: a cobertura precisa enxergar `src/`, e os testes importam por
 * `src/...` justamente para deixar explícito que estão de fora olhando para
 * dentro.
 *
 * Ao contrário do `subscription-core`, não há `moduleNameMapper` para nenhum
 * workspace package aqui: este core não tem `db` nem outro `*-core` injetado
 * (é puro, sem I/O — ver CLAUDE.md do package), então não existe risco de a
 * suíte cair no `main`/`dist` de uma dependência desatualizada.
 */
const config: Config = {
  displayName: '@vetor-wallet/validation-core',
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
