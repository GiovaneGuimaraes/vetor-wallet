import type { Config } from 'jest';

/**
 * Suíte unitária do `expenses-core`.
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
 * `@vetor-wallet/db` entra por duas razões: o TIPO `Db` (o client é injetado, e
 * o teste passa o mock de `tests/unit/testDb.ts`) e a função
 * `isUniqueViolation`, que `materializeRecurringExpenses` usa para reconhecer o
 * perdedor de uma corrida.
 *
 * Os testes de `createRecurringExpenseEntry` são os únicos que usam um client
 * REAL, contra um arquivo temporário: eles provam rollback de transação, e um
 * mock não provaria rollback nenhum — provaria apenas que o mock foi chamado.
 *
 * `isolatedModules` vive no `tests/tsconfig.json`, não como opção do ts-jest
 * (deprecada, sai na v30) — ver `savings-core`, que é o molde.
 */
const config: Config = {
  displayName: '@vetor-wallet/expenses-core',
  rootDir: '../..',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit/tests'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@vetor-wallet/db$': '<rootDir>/../db/src/index.ts',
    '^@vetor-wallet/shared$': '<rootDir>/../shared/src/index.ts',
    '^@vetor-wallet/validation-core$': '<rootDir>/../validation-core/src/index.ts',
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
