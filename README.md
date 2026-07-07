# Vetor Wallet

Carteira pessoal de ações da B3 com cadastro manual de operações, cálculo de posição consolidada e indicadores de rentabilidade.

> Para detalhes de arquitetura, comandos e pontos de atenção, veja [CLAUDE.md](./CLAUDE.md).

## Stack

- **web/** — Vite + React + TypeScript
- **server/** — Node + Express + TypeScript, SQLite via `@libsql/client`
- **Cotações** — [brapi.dev](https://brapi.dev) (API gratuita)

## Como funciona

1. Cadastre operações de compra/venda manualmente (ticker, tipo, quantidade, preço, data)
2. O servidor calcula a posição consolidada por ticker usando preço médio ponderado
3. As cotações atuais são buscadas na brapi.dev em tempo real
4. O dashboard exibe: investido, valor atual, resultado absoluto e percentual por ativo e no total

## Como rodar localmente

### Pré-requisitos

- Node.js 18+
- pnpm 10+ (`npm install -g pnpm`)

### Instalação

```bash
pnpm install
```

### Configuração

```bash
# server
cp server/.env.example server/.env
# Opcional: adicione seu token da brapi.dev para maior limite de requisições
# BRAPI_TOKEN=seu_token_aqui

# web
cp web/.env.example web/.env
```

### Desenvolvimento

```bash
pnpm dev
```

Acesse:
- **Web**: http://localhost:5173
- **API**: http://localhost:3001

### Build

```bash
pnpm build
```

## Próximos passos

- Importação de operações via CSV da corretora
- Alertas baseados em regras (concentração excessiva, queda brusca, etc.)
- Sugestões geradas por LLM a partir dos indicadores calculados
- Comparação da rentabilidade da carteira com CDI/Ibovespa
