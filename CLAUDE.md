# CLAUDE.md — Vetor Wallet

Guia de arquitetura e operação para assistentes de IA. Leia este arquivo antes de qualquer tarefa no repositório.

---

## Visão do produto

Vetor Wallet é uma carteira pessoal de ações da B3. O usuário cadastra operações de compra/venda manualmente; o servidor calcula posições consolidadas via preço médio ponderado e busca cotações em tempo real na [brapi.dev](https://brapi.dev). O dashboard exibe valor investido, valor atual e P&L por ativo e no total.

**Roadmap:** importação CSV de corretoras, alertas por regras, sugestões via LLM, comparação com CDI/Ibovespa.

---

## Stack e estrutura

```
vetor-wallet/
├── package.json            # raiz pnpm workspace (packageManager: pnpm@10.32.1)
├── pnpm-workspace.yaml     # packages: [web, server]
├── pnpm-lock.yaml          # lockfile único — não edite manualmente
├── server/                 # Node + Express + TypeScript (CJS)
│   ├── src/
│   │   ├── index.ts        # entry point: dotenv, Express, monta rotas, chama initDb()
│   │   ├── db.ts           # cliente @libsql/client + initDb() (cria tabela operations)
│   │   ├── types.ts        # interfaces de domínio (Operation, Position, PortfolioSummary…)
│   │   ├── routes/
│   │   │   ├── operations.ts   # CRUD de operações
│   │   │   └── portfolio.ts    # cálculo de posição + fetch de cotações
│   │   └── services/
│   │       └── quotes.ts   # fetchQuotes() → brapi.dev
│   ├── data/wallet.db      # SQLite local (gitignored, criado automaticamente)
│   ├── .env.example
│   └── tsconfig.json       # target ES2022, module CommonJS
└── web/                    # Vite + React 18 + TypeScript (ESM)
    ├── src/
    │   ├── main.tsx         # monta <App /> em StrictMode
    │   ├── App.tsx          # estado global, orquestra refresh após cada operação
    │   ├── api.ts           # todas as chamadas fetch ao server (baseURL via VITE_API_URL)
    │   ├── types.ts         # espelho exato de server/src/types.ts (ver ponto de atenção)
    │   └── components/
    │       ├── OperationForm.tsx       # form controlado de cadastro
    │       ├── OperationsList.tsx      # tabela de operações com delete
    │       └── PortfolioDashboard.tsx  # cards de resumo + tabela de posições
    ├── .env.example
    └── tsconfig.json        # strict, noEmit, moduleResolution: bundler
```

---

## Comandos principais

> Todos os comandos abaixo devem ser executados a partir da **raiz do repositório**.

```bash
# instalar dependências (gera/atualiza pnpm-lock.yaml na raiz)
pnpm install

# desenvolvimento (server em :3001, web em :5173)
pnpm dev

# build de produção (server → server/dist/, web → web/dist/)
pnpm build

# apenas server
pnpm dev:server
pnpm --filter vetor-wallet-server build

# apenas web
pnpm dev:web
pnpm --filter vetor-wallet-web build

# rodar server compilado (após build)
cd server && node dist/index.js
```

`pnpm dev` usa `&` para paralelismo — no Windows, considere usar dois terminais separados (`pnpm dev:server` e `pnpm dev:web`) se houver problemas.

---

## Configuração de ambiente

```bash
cp server/.env.example server/.env
cp web/.env.example web/.env
```

| Arquivo | Variável | Padrão | Obrigatório |
|---|---|---|---|
| `server/.env` | `PORT` | `3001` | Não |
| `server/.env` | `BRAPI_TOKEN` | — | Não (limite maior com token) |
| `web/.env` | `VITE_API_URL` | `http://localhost:3001` | Não |

O banco SQLite (`server/data/wallet.db`) é criado automaticamente em `initDb()` na primeira execução.

---

## API Routes

Base URL: `http://localhost:3001`

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/api/operations` | Lista todas as operações (ordem: date DESC) |
| `POST` | `/api/operations` | Cria operação — body: `{ ticker, type, quantity, price, date }` |
| `DELETE` | `/api/operations/:id` | Remove operação por ID |
| `GET` | `/api/portfolio` | Retorna `PortfolioSummary` com cotações em tempo real |

Todas as respostas são JSON. Ticker é normalizado para maiúsculas no POST.

---

## Schema do banco

```sql
CREATE TABLE IF NOT EXISTS operations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker     TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK(type IN ('BUY', 'SELL')),
  quantity   REAL    NOT NULL,
  price      REAL    NOT NULL,
  date       TEXT    NOT NULL,   -- formato YYYY-MM-DD
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
)
```

Driver: `@libsql/client` (libsql/SQLite). Sem ORM; queries são SQL puro.

---

## Convenções

- **TypeScript strict** em ambos os pacotes.
- **Sem ORM** — SQL puro via `@libsql/client`.
- **Sem autenticação** — API pública por design (projeto pessoal local).
- **Locale pt-BR/BRL** para formatação de números e moeda no frontend (`Intl.NumberFormat`).
- **CSS custom properties** para tema escuro — variáveis em `web/src/index.css` (`--bg`, `--surface`, `--accent`, `--positive`, `--negative`).
- **Nenhum gerenciador de estado externo** — estado em `App.tsx`, passado via props.
- **pnpm workspaces** — único lockfile na raiz. Nunca rode `npm install` ou `yarn` neste repositório.

---

## Política de testes

Toda mudança em código de produto — server ou web — deve vir acompanhada de um teste automatizado que cobre o comportamento novo ou alterado, **ou** de uma justificativa explícita de por que testes não se aplicam naquele caso.

Essa política vale igualmente para mudanças feitas manualmente e para mudanças feitas por IA (Claude Code ou qualquer outro assistente).

### Como rodar

```bash
# server (Vitest — já configurado)
pnpm --filter vetor-wallet-server test

# web — runner ainda não configurado (pendente issue #6)
# até lá, lógica isolável deve ser extraída para funções puras e testada via server
```

### Onde criar os testes

| Pacote | Padrão | Exemplo existente |
|---|---|---|
| `server` | `server/src/**/*.test.ts` | `server/src/services/portfolio.test.ts` |
| `web` | `web/src/**/*.test.ts` | — (pendente setup de runner) |

O `vitest.config.ts` do server inclui `src/**/*.test.ts` automaticamente.

### Quando testes não se aplicam

**Não exigem teste novo:**
- Ajustes de estilo/layout sem lógica (CSS, Tailwind classes)
- Refatoração sem mudança de comportamento (testes existentes devem continuar passando)
- Atualizações de documentação

**Sempre exigem teste:**
- Nova função de serviço ou utilitário com lógica de negócio
- Nova rota ou mudança de comportamento de rota existente
- Lógica de cálculo (posições, alertas, importação, benchmarks)

---

## Pontos de atenção

### Tipos duplicados
`server/src/types.ts` e `web/src/types.ts` são cópias manuais um do outro. Qualquer alteração de interface deve ser replicada nos dois arquivos. Candidato futuro a pacote `packages/shared`.

### CORS permissivo
`app.use(cors())` sem restrição de origem. Aceitável para uso local; deve ser restrito antes de qualquer exposição pública.

### Sem autenticação
A API não tem camada de auth. Qualquer cliente com acesso à rede pode ler e modificar a carteira.

### SELL sem validação de saldo
`portfolio.ts` usa `Math.max(0, newQty)` para vendas — vender mais do que se possui não é rejeitado, a quantidade é silenciosamente truncada a zero.

### `process.cwd()` no caminho do banco
`db.ts` constrói o path como `path.join(process.cwd(), 'data')`. O servidor **deve** ser iniciado a partir de `server/`, não da raiz. Os scripts pnpm garantem isso via `--filter`; rodar `node dist/index.js` da raiz resultaria em path errado.

### Falha silenciosa de cotações
`fetchQuotes` retorna um `Map` vazio em qualquer erro de rede/API sem logar nada. Posições sem cotação exibem `null` nos campos de valor atual e P&L.
