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
      // A entrada '/fixtures' vem ANTES da entrada base: o alias de string do
      // Vite casa por PREFIXO, então '@vetor-wallet/bank-import-core' sozinho
      // capturaria também o subpath e resolveria para '.../src/index.ts/fixtures'.
      '@vetor-wallet/bank-import-core/fixtures': path.resolve(
        __dirname,
        '../bank-import-core/src/__fixtures__/ofx.ts',
      ),
      '@vetor-wallet/bank-import-core': path.resolve(__dirname, '../bank-import-core/src/index.ts'),
      '@vetor-wallet/portfolio-core': path.resolve(__dirname, '../portfolio-core/src/index.ts'),
      '@vetor-wallet/insights-core': path.resolve(__dirname, '../insights-core/src/index.ts'),
      '@vetor-wallet/auth-core': path.resolve(__dirname, '../auth-core/src/index.ts'),
      '@vetor-wallet/db': path.resolve(__dirname, '../db/src/index.ts'),
      '@vetor-wallet/brapi-core': path.resolve(__dirname, '../brapi-core/src/index.ts'),
      '@vetor-wallet/abacatepay-core': path.resolve(__dirname, '../abacatepay-core/src/index.ts'),
      '@vetor-wallet/validation-core': path.resolve(__dirname, '../validation-core/src/index.ts'),
      '@vetor-wallet/billing-core': path.resolve(__dirname, '../billing-core/src/index.ts'),
      '@vetor-wallet/savings-core': path.resolve(__dirname, '../savings-core/src/index.ts'),
      '@vetor-wallet/expenses-core': path.resolve(__dirname, '../expenses-core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
