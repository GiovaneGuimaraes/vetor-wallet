# Sistema multi-agente — Vetor Wallet

Este diretório define o fluxo de trabalho multi-agente em loop fechado do projeto. **Todo agente (orquestrador ou executor) deve ler este arquivo antes de qualquer tarefa.**

## Papéis

| Papel | Modelo | Quem é | Responsabilidade |
|---|---|---|---|
| **Orquestrador** | Fable (sessão principal do Claude Code) | Você, se está lendo isto na sessão principal | Entender o app, priorizar, decompor trabalho em TODOs no `BACKLOG.md`, classificar complexidade, rotear modelos, delegar aos executores, revisar e integrar resultados |
| **Executor** | Sonnet (padrão) ou **Opus 5** (tarefas de complexidade alta) — roteado pelo orquestrador via parâmetro `model` da ferramenta Agent | Subagente `executor` criado via ferramenta Agent | Implementar UMA tarefa do backlog, com testes, em worktree isolado |
| **Revisor** | Sonnet (padrão) ou **Opus 5** (tarefas de risco alto — ver roteamento) | Subagente `revisor` criado via ferramenta Agent | Revisar o diff de uma tarefa concluída antes da integração |
| **Planejador** (opcional) | **Opus 5** (agente `Plan`) | Subagente criado via ferramenta Agent | Spike de design para tarefas de complexidade alta ANTES da execução: mapa de arquivos, abordagem, riscos — o resultado entra no prompt do executor |
| **Humano** | Giovane | Dono do projeto | Decisões de produto, itens do `TODO-HUMANO.md`, revisão a posteriori dos merges (modo auto — ver abaixo) |

## Documentos do sistema

| Arquivo | Dono da escrita | Conteúdo |
|---|---|---|
| [`ORQUESTRADOR.md`](./ORQUESTRADOR.md) | Humano (atualizado pelo orquestrador com aprovação) | Contexto do app e prioridades atuais — leitura inicial obrigatória do orquestrador |
| [`BACKLOG.md`](./BACKLOG.md) | Orquestrador | **Só trabalho vivo.** Tarefa concluída sai do arquivo — não migra para outro lugar do repo. Teto de 8 KB, verificado por `pnpm backlog:check` |
| [`CALIBRAGEM.md`](./CALIBRAGEM.md) | Orquestrador | Placar dos modelos e as causas das reprovações — o dado que calibra o roteamento abaixo |
| [`TODO-HUMANO.md`](./TODO-HUMANO.md) | Executores e orquestrador | Pendências que só o humano pode resolver (decisões, credenciais, aprovações) |
| `../../CLAUDE.md` | Humano | Arquitetura, comandos, convenções e política de testes — leitura obrigatória de todos |

## Interface no Discord

O loop tem uma superfície opcional no Discord — 4 canais (`#backlog`, `#todo-ai`,
`#todo-human`, `#docs-app`), operada pelo orquestrador via
[`tools/discord/`](../../tools/discord/README.md).

**É só saída, mais decisões.** Não há canal de entrada: trabalho novo nasce na sessão do
Claude Code, conversado. Status e pendências viajam bem por mensagem porque são conteúdo
pronto e a resposta é um clique; *começar* trabalho exige ida e volta, que uma mensagem
única não tem. Um `#new-tasks` e um daemon de Gateway existiram e foram removidos em
2026-08-10 por isso — estão no git se o cenário mudar.

Regras que valem sempre:

- **Discord é interface, não fonte da verdade.** `BACKLOG.md` e `TODO-HUMANO.md` continuam
  sendo o estado real; as mensagens são espelhos editáveis. Divergiu? O markdown ganha.
- **Só o orquestrador escreve no Discord e em `discord-state.json`** — mesma regra do
  `BACKLOG.md`, para não haver conflito de escrita entre worktrees. Executores seguem
  reportando ao orquestrador.
- O humano confirma por reação (✅ aprova · ❌ recusa · 🔁 refaz) ou por resposta em texto;
  o orquestrador transcreve a resposta para o campo "Resposta do humano" do `TODO-HUMANO.md`,
  que segue sendo o registro permanente da decisão.
- **Ao fechar uma onda de tarefas, atualize o `#docs-app`** (mensagem única, editada) com o
  resumo legível do app. É vista derivada dos `CLAUDE.md` de package e de `docs/decisions/` —
  nunca uma quarta cópia de "o que o app é". Se divergir do repo, o repo ganha.

## O loop fechado

```
┌─────────────────────────────────────────────────────────┐
│ 1. PLANEJAR (orquestrador / Fable)                       │
│    Lê ORQUESTRADOR.md + CLAUDE.md + BACKLOG.md           │
│    Cria/atualiza TODOs no BACKLOG.md com prioridade      │
│                        │                                 │
│ 2. DELEGAR (orquestrador)                                │
│    Para cada TODO pronto: spawn de subagente `executor`  │
│    com isolation: worktree (branch própria por tarefa).  │
│    Tarefas independentes rodam em paralelo.              │
│                        │                                 │
│ 3. EXECUTAR (executor / Sonnet)                          │
│    Implementa a tarefa + testes no worktree isolado.     │
│    Bloqueou em decisão humana? → registra no             │
│    TODO-HUMANO.md e devolve status BLOQUEADA.            │
│                        │                                 │
│ 4. REVISAR (revisor / Sonnet, spawn do orquestrador)     │
│    Revisa o diff: corretude, testes, convenções do       │
│    CLAUDE.md. Reprovou? → volta ao passo 3 com feedback. │
│                        │                                 │
│ 5. INTEGRAR (orquestrador)                               │
│    Atualiza status no BACKLOG.md, consolida resultados,  │
│    reporta ao humano, abre PR e faz merge (modo auto —   │
│    autorização permanente do humano, 2026-07-24).        │
│                        │                                 │
│ 6. FECHAR O LOOP                                         │
│    Orquestrador reavalia prioridades com o que aprendeu  │
│    e volta ao passo 1.                                   │
└─────────────────────────────────────────────────────────┘
```

## Roteamento de modelos (quem roda em quê)

O orquestrador classifica cada tarefa do `BACKLOG.md` com um campo **Complexidade** e escolhe o modelo do executor/revisor pelo parâmetro `model` da ferramenta Agent (que sobrepõe o default do frontmatter do subagente).

| Complexidade | Sinais típicos | Executor | Revisor |
|---|---|---|---|
| **baixa** | mudança mecânica/repetitiva, docs, ajuste de estilo/CSS, renomear, asset estático | `haiku` (default) | `sonnet` (docs puros: `haiku`) |
| **média** | feature padrão sobre padrões existentes (nova rota espelhando outra, tela nova sobre API pronta, teste novo) | `sonnet` (default) | `sonnet` |
| **alta** | cálculo financeiro (preço médio, P&L, saldo), mudança de schema/migração, auth/isolamento por `user_id`, refactor multi-pacote (`shared`+`server`+`web`), lógica com muitos casos de borda, débito que já causou reprovação antes | `opus` | `sonnet` |

Regras complementares:

- **Baixa roda em Haiku por decisão de custo (2026-08-01)** — "haiku ou sonnet" na prática virava sempre Sonnet; agora Haiku é o default para complexidade baixa. Critério de segurança: a tarefa baixa só pode ir para Haiku se **não** tocar lógica de negócio nem SQL (docs, CSS/estilo, rename, texto de UI, asset, config trivial). Tocou qualquer código com comportamento testável → classifique como média (Sonnet). O revisor continua Sonnet, exceto diffs 100% de docs/markdown, que podem ser revisados em Haiku.
- **Escalonamento Haiku → Sonnet**: 1 veredito REPROVADA em tarefa executada por Haiku já re-delega o próximo ciclo em Sonnet (não espere as 2 reprovações da regra do Opus).

- **Revisor é sempre Sonnet por decisão de custo do humano (2026-07-25)** — o Opus na revisão encareceu demais o loop. Exceções pontuais só com pedido explícito do humano. Se um revisor Sonnet se declarar inseguro num ponto de dinheiro/auth, o orquestrador pode verificar aquele ponto específico ele mesmo em vez de escalar o modelo.
- **Escalonamento automático**: 2 vereditos REPROVADA seguidos na mesma tarefa → o orquestrador re-delega o próximo ciclo com executor `opus`, incluindo no prompt o histórico dos achados das reprovações.
- **Spike de design (opcional, recomendado para alta)**: antes de delegar uma tarefa alta, o orquestrador pode spawnar o agente `Plan` com `model: "opus"` para produzir plano de implementação (arquivos-alvo, abordagem, riscos, casos de borda). O plano entra na íntegra no prompt do executor — reduz retrabalho e permite até executar em Sonnet com plano de Opus quando o desafio é de *design*, não de *execução*.
- **Na dúvida entre média e alta, escolha alta.** O custo extra de Opus numa tarefa é menor que um ciclo executar→reprovar→corrigir→re-revisar.
- **O que a evidência dos ciclos 1–20 diz** ([`CALIBRAGEM.md`](./CALIBRAGEM.md)): nenhuma reprovação caiu em cálculo financeiro (essas foram para Opus e passaram) — todas caíram em **estado assíncrono, gates de render e consistência entre N arquivos**, que é onde lint, build e suíte passam verdes com o código errado. Haiku nunca errou código, mas errou um **relatório** (T-095): com Haiku, confira o diff, não a prosa.
- Ao concluir, o modelo usado e o veredito vão para o **corpo da PR**; só o que muda decisão futura de roteamento entra em `CALIBRAGEM.md`. Nada disso volta para o `BACKLOG.md`.

## Regras de paralelismo (multi-branch)

- Cada tarefa delegada roda com **`isolation: "worktree"`** na ferramenta Agent — o executor recebe um git worktree próprio e não conflita com outros executores.
- O orquestrador só paraleliza tarefas **sem dependência entre si** (marcadas no `BACKLOG.md`). Tarefas que tocam os mesmos arquivos rodam em série.
- Alternativa manual (fora do Claude Code): `git worktree add ../vetor-wallet-<tarefa> -b feat/<tarefa>` e uma sessão `claude` em cada diretório.

## Regras de comunicação

- **Executores nunca perguntam ao humano diretamente** — registram a dúvida no `TODO-HUMANO.md` e devolvem a tarefa como `BLOQUEADA` com o motivo.
- **Executores devolvem dados, não prosa** — o retorno final do subagente deve dizer: o que foi feito, arquivos alterados, testes rodados (comando + resultado), e pendências.
- **O orquestrador é o único que escreve no `BACKLOG.md`** — executores reportam; orquestrador atualiza status. Evita conflito de escrita entre worktrees.
- Toda mudança de produto segue a **política de testes do CLAUDE.md**: teste automatizado ou justificativa explícita.

## Estados de uma tarefa

`PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA` ⇄) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`
