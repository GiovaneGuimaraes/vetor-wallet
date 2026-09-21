import type { Config } from 'jest';

/**
 * Suíte unitária do `savings-core`.
 *
 * `rootDir` é a RAIZ DO PACKAGE (dois níveis acima deste arquivo), não esta
 * pasta: a cobertura precisa enxergar `src/`, e os testes importam por
 * `src/...` justamente para deixar explícito que estão de fora olhando para
 * dentro.
 *
 * `moduleNameMapper` aponta os workspace packages para o CÓDIGO-FONTE. Sem isso
 * a resolução cairia no `main` (`dist/index.js`) do package.json, que pode não
 * existir ou estar desatualizado — a suíte passaria a validar um build antigo
 * (falso verde). Mesmo motivo do `resolve.alias` nos `vitest.config.ts` do
 * resto do monorepo.
 *
 * `@vetor-wallet/db` aparece aqui só pelo TIPO `Db`: nenhuma função deste core
 * importa o singleton — o client é injetado, e o teste passa o mock de
 * `tests/unit/testDb.ts`.
 *
 * `isolatedModules` vive no `tests/tsconfig.json`, não aqui: como opção do
 * ts-jest ela está DEPRECADA e sai na v30. Os dois packages Jest anteriores
 * (subscription-core, validation-core) ainda usam a forma antiga e imprimem o
 * aviso a cada `pnpm test`; como o Jest virou o padrão (decisão do humano,
 * 2026-09-20), a forma nova entra aqui para não se propagar pelos sete cores
 * que ainda vão migrar.
 */
const config: Config = {
  displayName: '@vetor-wallet/income-core',
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
