import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    // Ver comentário equivalente em packages/rest-api/vitest.config.ts: sem o
    // alias explícito o Vitest resolveria pelo `main`/dist do package, que
    // pode não existir ou estar desatualizado (falso verde).
    alias: {
      '@vetor-wallet/db': path.resolve(__dirname, '../db/src/index.ts'),
      '@vetor-wallet/query': path.resolve(__dirname, '../query/src/index.ts'),
      '@vetor-wallet/validation-core': path.resolve(__dirname, '../validation-core/src/index.ts'),
      // Os testes importam por `src/...` (formato-alvo, como nos cores Jest).
      src: path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/__fixtures__/**'],
      // Sem `thresholds` de propósito: os parsers (ofx/pluggy) têm ~9% de
      // branches sem teste desde antes da T-116c (cobertura medida, não imposta).
      // Fechar isso é tarefa própria; imposto agora, o `--coverage` nasceria
      // vermelho por código que esta fatia não tocou.
    },
  },
});
