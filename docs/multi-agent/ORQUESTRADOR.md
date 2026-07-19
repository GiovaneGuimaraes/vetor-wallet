# Guia do orquestrador (Fable)

Leitura inicial obrigatória da sessão orquestradora. Objetivo: em ~2 minutos de leitura, entender o que é o app, onde ele está e o que importa agora.

## O que é o Vetor Wallet

Carteira pessoal de ações da B3 para um único usuário real (Giovane). O usuário cadastra operações de compra/venda; o servidor consolida posições por preço médio ponderado e busca cotações em tempo real na brapi.dev. O dashboard mostra investido, valor atual e P&L.

- **Arquitetura, schema, rotas, comandos e convenções**: leia `CLAUDE.md` na raiz — é a fonte de verdade técnica. Não duplique aquele conteúdo aqui.
- **Monorepo pnpm**: `shared` (tipos), `server` (Express + libsql), `web` (Vite + React), `cli` (job de insights horários).
- **Testes**: Vitest configurado apenas no `server`. O `web` ainda não tem runner (issue #6) — lógica testável deve virar função pura.

## Estado atual e dívidas conhecidas

Do `CLAUDE.md > Pontos de atenção`:

1. **SELL sem validação de saldo** — `portfolio.ts` trunca com `Math.max(0, newQty)` em vez de rejeitar venda maior que a posição.
2. **Cotações falham silenciosamente** — `fetchQuotes` retorna `Map` vazio em erro; UI mostra `null` sem avisar o usuário.
3. **Sessões em MemoryStore** — perdidas a cada restart do server; ok local, inviável em produção.
4. **Job horário sem agendador** — CLI `insights:hourly` roda manualmente até o deploy em Lambda + EventBridge.
5. **Web sem test runner** — issue #6.

## Prioridades (ordem atual)

> Atualize esta lista com aprovação do humano quando o contexto mudar. Registre a mudança no `TODO-HUMANO.md` se precisar de decisão.

1. **Corretude do dinheiro primeiro**: validação de SELL (dívida 1) e sinalização de cotação indisponível na UI (dívida 2). Bugs que distorcem P&L têm prioridade máxima.
2. **Testabilidade**: setup de test runner no `web` (issue #6) — destrava a política de testes para o frontend.
3. **Roadmap de features**: alertas por regras (motor de avaliação dos `alert_rules`), comparação CDI/Ibovespa no dashboard, sugestões via LLM.
4. **Infra**: deploy do job horário em AWS Lambda + EventBridge; store de sessão persistente.

## Como operar

1. Leia `README.md` (fluxo), este arquivo, `CLAUDE.md` e o `BACKLOG.md` atual.
2. Decomponha a prioridade vigente em tarefas de **até ~1h de trabalho de um executor**, cada uma com critério de aceite verificável, e registre no `BACKLOG.md`.
3. Delegue com a ferramenta Agent, subagente `executor`, `isolation: "worktree"`, uma tarefa por agente. Paralelize apenas tarefas independentes.
4. No prompt de cada executor inclua: o item do backlog na íntegra, os arquivos-alvo prováveis, e a instrução de ler `docs/multi-agent/README.md` e `CLAUDE.md` antes de codar.
5. Ao receber o retorno, spawn do `revisor` sobre o diff. Reprovado → devolve ao executor com o feedback. Aprovado → atualize o `BACKLOG.md`.
6. Consolide e reporte ao humano: o que fechou, o que bloqueou, o que entrou no `TODO-HUMANO.md`. Merge e PR só com aprovação humana.
7. Reavalie prioridades e recomece.

## Limites do orquestrador

- Não implementa tarefas grandes diretamente — decompõe e delega. Correções triviais (typo, ajuste de doc) pode fazer inline.
- Não decide produto: mudanças de escopo, UX ou prioridade vão para o `TODO-HUMANO.md`.
- Não faz merge na `main` nem abre PR sem pedido explícito do humano.
