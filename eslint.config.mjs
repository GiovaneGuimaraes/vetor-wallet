import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

/**
 * ESLint de TODO o monorepo, num arquivo só.
 *
 * Antes existiam duas configs (`packages/rest-api/eslint.config.mjs` e
 * `packages/web/eslint.config.js`) e o script da raiz era
 * `--filter server && --filter web`. Consequência: **nenhum dos onze `*-core`
 * nem o `db` passava por ESLint** — e como o CI roda Lint antes de Test em
 * série, a lacuna vivia numa etapa que já provou ser capaz de derrubar a suíte
 * inteira sem ninguém notar (T-101: o Lint ficou vermelho por semanas e o step
 * de Test nunca chegou a executar).
 *
 * Config única na raiz, e não uma por package, porque a alternativa é lembrar
 * de criar o arquivo a cada package novo — exatamente o esquecimento que criou
 * o problema. Aqui um package novo já nasce coberto: quem decide o escopo é o
 * `files`/`ignores` daqui, não a existência de um arquivo lá dentro. Mesmo
 * padrão que o `.prettierrc` já seguia.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/reports/**',
      '**/.stryker-tmp/**',
      '**/node_modules/**',
      // Worktrees temporários dos subagentes (já ignorados pelo git). Trazem um
      // node_modules próprio dentro do repo, e varrê-los faz o ESLint resolver
      // os plugins de lá — erro de módulo, não de lint.
      '.claude/**',
    ],
  },

  ...tseslint.configs.recommended,

  // Desliga o que conflita com o Prettier. Tem de vir DEPOIS do recommended.
  prettierConfig,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // --- Só o web: regras de React ------------------------------------------
  {
    ...reactHooks.configs.flat.recommended,
    files: ['packages/web/**/*.{ts,tsx}'],
  },
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // v7 rule is too broad: flags valid async data-fetching via useCallback+useEffect
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // --- Arquivos de teste ---------------------------------------------------
  {
    // `__fixtures__` entra aqui junto dos testes (T-106): é código que só existe
    // para teste — excluído do build pelo `exclude` do tsconfig — e faz o mesmo
    // que um teste faz, montar payload externo fora do formato feliz.
    files: ['**/*.test.{ts,tsx}', '**/tests/**/*.{ts,tsx}', '**/__fixtures__/**/*.{ts,tsx}'],
    rules: {
      // Teste monta linha de banco/resposta de API fora do formato feliz para
      // provar a normalização; o `as unknown as X` é a forma honesta de dizer
      // "isto é de propósito" e não deve pedir supressão caso a caso.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
