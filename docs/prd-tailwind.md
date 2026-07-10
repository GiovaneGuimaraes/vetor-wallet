# PRD — Migração para Tailwind CSS

> **Status:** implementado (issue #5)
> Gerado pelo agente `prd-writer` como caso de validação.

---

### 1. Contexto e problema

O frontend usa CSS custom properties definidas manualmente em `web/src/index.css` e classes utilitárias escritas à mão em cada componente. Sem um sistema de design unificado, cada componente redefine padrões de espaçamento, tipografia e cores de formas ligeiramente inconsistentes, aumentando a fricção ao adicionar novos componentes e ao manter o tema escuro.

### 2. Objetivo

Migrar o frontend para Tailwind CSS v4, usando utility classes para todo estilo de componente e mantendo as custom properties de cor existentes como tokens do design system.

### 3. Não-objetivos

- Não alterar a paleta de cores ou o tema escuro atual.
- Não redesenhar a interface — resultado visual deve ser idêntico ao anterior.
- Não adicionar dark/light mode toggle (o projeto é dark-only por design).
- Não migrar o server ou o pacote shared.

### 4. Persona afetada

Desenvolvedor mantendo o projeto: quer adicionar ou modificar componentes rapidamente sem precisar rastrear classes CSS customizadas espalhadas em múltiplos arquivos.

### 5. Requisitos funcionais

1. Instalar `tailwindcss` e `@tailwindcss/vite` como devDependencies em `vetor-wallet-web`.
2. Configurar o plugin Tailwind no `vite.config.ts` do web.
3. Reescrever todos os componentes em `web/src/components/` usando utility classes Tailwind, eliminando classes CSS customizadas avulsas.
4. Expor as custom properties de cor existentes (`--color-canvas`, `--color-card`, `--color-accent`, etc.) como tokens Tailwind via `@theme` em `index.css`, de forma que `bg-canvas`, `text-accent`, etc. funcionem como classes.
5. Manter `web/src/index.css` como único ponto de definição das cores e do `color-scheme: dark`.
6. O build de produção (`pnpm build`) deve continuar funcionando sem erros.

### 6. Requisitos não-funcionais

- **Regressão visual:** nenhuma diferença visual perceptível antes/depois da migração.
- **Performance:** o bundle CSS gerado pelo Tailwind (purge automático) deve ser igual ou menor que o CSS anterior.
- **Compatibilidade de API:** nenhuma mudança de contrato de API — a migração é puramente de frontend/CSS.
- **Comportamento em erro:** não aplicável (sem chamadas externas).

### 7. Critérios de aceite

- Dado que o desenvolvedor roda `pnpm build`, quando o build completa, então nenhum erro de TypeScript ou Tailwind é emitido.
- Dado que o usuário abre o dashboard com posições cadastradas, quando a página carrega, então o layout, cores e tipografia são visualmente idênticos ao estado pré-migração.
- Dado que o desenvolvedor inspeciona o bundle CSS, quando analisa as classes, então não há classes CSS customizadas avulsas — apenas utility classes Tailwind e as custom properties de tema.
- Dado que o usuário está em um ambiente com `prefers-color-scheme: dark`, quando a página carrega, então o tema escuro é aplicado corretamente via `color-scheme: dark` no `:root`.

### 8. Métricas de sucesso

- Build passa sem erros após a migração.
- Nenhuma regressão visual identificada na revisão manual dos componentes existentes.
- Adicionar um novo componente de UI leva menos código CSS explícito do que antes.

### 9. Riscos e dependências

| Item | Detalhe | Mitigação |
|---|---|---|
| Tailwind v4 breaking changes | A v4 mudou a forma de configuração (sem `tailwind.config.js`; usa `@theme` em CSS) | Seguir a documentação oficial da v4; usar `@tailwindcss/vite` em vez do plugin legado |
| Classes arbitrárias vs. tokens | Risco de usar valores hardcoded em vez dos tokens de cor definidos | Code review garante que todas as cores vêm dos tokens `@theme` |
| Purge incorreto | Tailwind pode não detectar classes geradas dinamicamente | Evitar concatenação de strings para nomes de classe; usar lookup objects ou classes completas |

**Dependências:** nenhuma — pode ser feita a qualquer momento.

### 10. Plano de rollout

1. Instalar dependências via `pnpm --filter vetor-wallet-web add -D tailwindcss @tailwindcss/vite`.
2. Configurar plugin em `vite.config.ts`.
3. Definir tokens de cor via `@theme` em `index.css`.
4. Migrar componente a componente em um único PR (escopo pequeno — 3 componentes principais).
5. Verificação manual: rodar `pnpm dev:web`, navegar pelo dashboard com dados de teste.
6. Verificação de build: `pnpm build` sem erros.
7. Merge na branch `main`.
