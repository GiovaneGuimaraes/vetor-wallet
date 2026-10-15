import type { Config } from 'jest';

/**
 * Suíte unitária do `alerts-core` — mesmo molde do `operations-core` (T-104)
 * e do `savings-core` (T-110a/b).
 *
 * `rootDir` é a RAIZ DO PACKAGE (dois níveis acima deste arquivo), não esta
 * pasta: a cobertura precisa enxergar `src/`, e os testes importam por
 * `src/...` justamente para deixar explícito que estão de fora olhando para
 * dentro.
 *
 * `moduleNameMapper` aponta os workspace packages para o CÓDIGO-FONTE. Sem isso
 * a resolução cairia no `main` (`dist/index.js`) do package.json, que pode não
 * existir ou estar desatualizado — a suíte passaria a validar um build antigo
 * (falso verde).
 *
 * `@vetor-wallet/db` aparece aqui só pelo TIPO `Db`: nenhuma função deste core
 * importa o singleton — o client é injetado, e o teste passa o mock de
 * `tests/unit/testDb.ts`.
 *
 * `isolatedModules` vive no `tests/tsconfig.json`, não aqui: como opção do
 * ts-jest ela está DEPRECADA e sai na v30.
 */
const config: Config = {
  displayName: '@vetor-wallet/alerts-core',
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
