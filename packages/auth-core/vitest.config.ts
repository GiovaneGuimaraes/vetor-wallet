import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    // Ver comentário equivalente em packages/rest-api/vitest.config.ts: sem o
    // alias explícito o Vitest resolveria pelo `main`/dist do package, que
    // pode não existir ou estar desatualizado (falso verde). Vale também para
    // core → core (portfolio-core).
    alias: {
      '@vetor-wallet/db': path.resolve(__dirname, '../db/src/index.ts'),
      // Alias TRANSITIVO: quem importa é `db/src/migrations.ts`, não este
      // package. Sem ele, o teste que usa banco de verdade (cognitoMirror)
      // quebra ao resolver o `main`/dist do validation-core (T-106).
      '@vetor-wallet/validation-core': path.resolve(__dirname, '../validation-core/src/index.ts'),
      '@vetor-wallet/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@vetor-wallet/portfolio-core': path.resolve(__dirname, '../portfolio-core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
