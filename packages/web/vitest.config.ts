import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Dois tipos de teste no mesmo runner (T-092):
 *
 * - **Funções puras** (`*.test.ts`) rodam em `node`, que é o default e o mais
 *   rápido — são a maioria e não tocam DOM.
 * - **Componentes** (`*.test.tsx`) precisam de DOM. Em vez de ligar `jsdom`
 *   para a suíte inteira (que cobraria o custo de montar um DOM em ~460 testes
 *   que não usam nenhum), cada arquivo de componente declara
 *   `// @vitest-environment jsdom` no topo. O default segue `node`.
 *
 * O plugin do React entra aqui porque `.tsx` de teste precisa da mesma
 * transformação de JSX que o app.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
