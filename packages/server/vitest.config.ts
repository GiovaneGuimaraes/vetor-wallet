import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    // Testes/dev resolvem o CÓDIGO-FONTE de @vetor-wallet/db, nunca o `dist`
    // (que só existe depois de `pnpm build` e pode estar desatualizado). O
    // `main`/`types` do package apontam para `dist/` de propósito — é o que
    // o server COMPILADO precisa em produção (require() não entende .ts) —
    // então sem este alias explícito o Vitest cairia no `main` do
    // package.json e a suíte passaria a validar um build antigo (falso
    // verde). tsc/tsx já resolvem certo via `paths` do tsconfig.json.
    alias: {
      '@vetor-wallet/db': path.resolve(__dirname, '../db/src/index.ts'),
      '@vetor-wallet/brapi-core': path.resolve(__dirname, '../brapi-core/src/index.ts'),
      '@vetor-wallet/abacatepay-core': path.resolve(__dirname, '../abacatepay-core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
