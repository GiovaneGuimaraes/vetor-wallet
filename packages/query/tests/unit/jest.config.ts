import type { Config } from 'jest';

/**
 * Suíte do `postgresdb`.
 *
 * **Primeira exceção do formato**: aqui a cobertura não é 100% por threshold.
 * `initialize.ts` e `sync.ts` abrem conexão de verdade — prová-los exige um
 * Postgres no ar, o que é teste de integração e roda com `docker compose up`,
 * fora do `pnpm test` do CI (ver o CLAUDE.md do package).
 *
 * O que este projeto cobre são as **decisões declarativas do schema**, que é
 * onde um erro passa despercebido: nome de tabela, tipo de coluna de dinheiro,
 * unicidade que segura corrida, e a ausência deliberada de `password_hash`.
 */
const config: Config = {
  displayName: '@vetor-wallet/query',
  rootDir: '../..',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit/tests'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^tests/(.*)$': '<rootDir>/tests/$1',
  },
  clearMocks: true,
};

export default config;
