import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    // Ver comentário equivalente em packages/rest-api/vitest.config.ts: sem o
    // alias explícito o Vitest resolveria pelo `main`/dist do package, que
    // pode não existir ou estar desatualizado (falso verde).
    alias: {
      '@vetor-wallet/db': path.resolve(__dirname, '../db/src/index.ts'),
      '@vetor-wallet/validation-core': path.resolve(__dirname, '../validation-core/src/index.ts'),
      '@vetor-wallet/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // `index.ts` é barrel (só reexporta) e `testDb.ts` é helper de teste —
      // mesma exclusão do cognito-core, o outro package no formato-alvo.
      exclude: ['src/index.ts', 'src/testDb.ts', 'src/**/*.test.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
