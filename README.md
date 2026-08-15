# Vetor Wallet

Carteira financeira pessoal organizada em layers — Renda mensal, Despesas (fixas + variáveis com recorrência e orçamento), Poupança/Reserva e Ações da B3 (cadastro manual de operações, posição consolidada por preço médio ponderado e cotações em tempo real).

> Para detalhes de arquitetura, comandos e pontos de atenção, veja [CLAUDE.md](./CLAUDE.md).

## Stack

- **packages/web/** — Vite + React + TypeScript
- **packages/rest-api/** — Node + Express + TypeScript, SQLite via `@libsql/client`
- **Cotações** — [brapi.dev](https://brapi.dev) (API gratuita)

## Como funciona

1. A Home mostra os layers financeiros: renda, despesas, poupança e ações
2. Renda e despesas combinam itens fixos mensais com lançamentos datados (com recorrência, categorias e histórico); a poupança é um livro de lançamentos (aportes, retiradas e rendimento)
3. No layer de ações, cadastre operações de compra/venda manualmente (ticker, tipo, quantidade, preço, data) — o servidor calcula a posição consolidada por preço médio ponderado e busca cotações na brapi.dev em tempo real
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
cp packages/rest-api/.env.example packages/rest-api/.env
# Opcional: adicione seu token da brapi.dev para maior limite de requisições
# BRAPI_TOKEN=seu_token_aqui

# web
cp packages/web/.env.example packages/web/.env
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

- Agendador do job de insights horários (AWS Lambda + EventBridge)
- Backend do layer de criptomoedas (hoje a tela é mock "em breve")
- Redesign da UI de alertas, importação CSV e comparativo CDI/Ibovespa (backends prontos, ocultos da interface aguardando redesign)
- Sugestões geradas por LLM a partir dos indicadores calculados
