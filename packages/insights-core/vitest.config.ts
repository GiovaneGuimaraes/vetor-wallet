import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    // Ver comentário equivalente em packages/server/vitest.config.ts: sem o
    // alias explícito o Vitest resolveria pelo `main`/dist do package, que
    // pode não existir ou estar desatualizado (falso verde). Vale também para
    // core → core: sem o alias de portfolio-core, hourlyInsights.test.ts
    // validaria o dist daquele package em vez do fonte.
    alias: {
      '@vetor-wallet/db': path.resolve(__dirname, '../db/src/index.ts'),
      '@vetor-wallet/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@vetor-wallet/brapi-core': path.resolve(__dirname, '../brapi-core/src/index.ts'),
      '@vetor-wallet/portfolio-core': path.resolve(__dirname, '../portfolio-core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
