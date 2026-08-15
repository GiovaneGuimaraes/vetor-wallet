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
| [`BACKLOG.md`](./BACKLOG.md) | Orquestrador | **Só trabalho vivo.** Tarefa concluída sai do arquivo — não migra para outro lugar do repo. Teto de 8 KB, verificado por `pnpm backlog:check`. Modelo de tarefa e rationale da higiene: abaixo |
| [`CALIBRAGEM.md`](./CALIBRAGEM.md) | Orquestrador | Placar dos modelos e as causas das reprovações — o dado que calibra o roteamento abaixo |
| [`TODO-HUMANO.md`](./TODO-HUMANO.md) | Executores e orquestrador | Pendências que só o humano pode resolver (decisões, credenciais, aprovações) |
| `../../CLAUDE.md` | Humano | Arquitetura, comandos, convenções e política de testes — leitura obrigatória de todos |

## Higiene do `BACKLOG.md` e modelo de tarefa

O backlog é lido em **toda** sessão do orquestrador, então cada caractere ali é pago
repetidamente — foi por isso que ele chegou a 78 KB com 77% de tarefas concluídas antes do
guard existir (regra que depende de alguém lembrar já falhou). O arquivo tem o resumo
operacional das quatro regras; o motivo de cada uma fica aqui:

- **Tarefa concluída sai do backlog e não migra para outro arquivo do repo.** O registro do
  que foi feito já existe em dois lugares melhores: as **PRs mergeadas** e o **histórico do
  git**. Documentação de *como o app é hoje* pertence aos `CLAUDE.md` de cada package e a
  `docs/decisions/` — nunca a um backlog, que por natureza descreve estados intermediários
  já superados.
- **Teto de 8 KB**, verificado por `pnpm backlog:check` (no CI desde 2026-08-10). Estourar é
  sintoma, não o problema: significa tarefa concluída que não saiu, ou spec inflada.
- **Tarefa viva cabe em ~700 caracteres**: objetivo, aceite, complexidade, arquivos-alvo. O
  detalhamento de execução (fases, casos de borda, plano de arquivos) pertence ao **prompt do
  executor**, não ao backlog. Post-mortem — resultado, achados do revisor, histórico de
  reprovação — vai para o corpo da PR, e o que muda decisão futura de roteamento vai para
  `CALIBRAGEM.md`.
- **Pendência que depende do humano não é backlog** — vai para `TODO-HUMANO.md`.

```markdown
### T-000 — Título curto e imperativo
- **Status**: PENDENTE · **Complexidade**: baixa | média | alta · **Depende de**: —
- **Objetivo**: por que existe e o que fazer.
- **Arquivos-alvo**: caminhos prováveis.
- **Critério de aceite**: verificável + comando de teste.
```

## Interface no Discord

O loop tem uma superfície opcional no Discord — 5 canais (`#backlog`, `#todo-ai`,
`#todo-human`, `#docs-app`, `#agentic-system`), operada pelo orquestrador via
[`tools/discord/`](../../tools/discord/README.md).

**É só saída, mais decisões.** Não há canal de entrada: trabalho novo nasce na sessão do
Claude Code, conversado. Status e pendências viajam bem por mensagem porque são conteúdo
pronto e a resposta é um clique; *começar* trabalho exige ida e volta, que uma mensagem
única não tem. Um `#new-tasks` e um daemon de Gateway existiram e foram removidos em
2026-08-10 por isso — estão no git se o cenário mudar.

Regras que valem sempre:

- **REGRA DURA (2026-08-12): espelhar é parte de concluir, não um passo opcional no fim.**
  Toda vez que o orquestrador **escreve no `BACKLOG.md` ou no `TODO-HUMANO.md`**, o espelho
  correspondente vai junto — na **mesma resposta**, antes de reportar ao humano. Não existe
  "atualizo o Discord depois": o humano acompanha o loop pelo celular, e markdown atualizado
  com Discord parado é pior que Discord nenhum, porque ele confia no que está lendo lá.
  Vale para: tarefa que muda de status, tarefa nova, pendência nova, decisão registrada,
  tarefa concluída. Se o commit tocou um desses dois arquivos e nenhuma chamada ao
  `bridge.mjs` aconteceu, o ciclo está incompleto.
- **Tarefa concluída mexe em DOIS canais, não um** (regra dura, 2026-08-12 — pedido explícito
  do humano). Ao concluir, faça os três passos como um bloco só:
  1. o bloco da tarefa **sai** do `BACKLOG.md` (higiene);
  2. a mensagem dela no **`#todo-ai`** é editada para `CONCLUIDA` **com o link da PR**;
  3. o espelho do **`#backlog`** é editado — a tarefa sai da fila e entra na lista
     "Concluídas desde o último espelho", e as tarefas que mudaram de posição refletem isso.
  O passo 3 é o mais esquecido justamente por ser o que não tem mensagem própria: o `#backlog`
  é **uma** mensagem editada, então quem só mexe no `#todo-ai` deixa a fila mentindo — mostrando
  como pendente algo que já foi mergeado. É a visão que o humano abre primeiro.
  *Origem*: em 2026-08-12 o humano cobrou — a T-088 foi espelhada, mas a T-089, o bloqueador
  comercial da Pluggy e o incidente de privacidade ficaram só no git por três atualizações.
- **REGRA DURA (2026-08-15): colher resposta é o passo 0, não um favor do humano.** O loop
  escrevia no `#todo-human` e nunca voltava para ler. A pendência da T-091b (remover Metas)
  ficou **dois dias** com a resposta dada — reação 2️⃣ na mensagem — e só foi vista porque o
  humano abriu a sessão dizendo "veja a resposta no Discord". Enquanto isso a tarefa constava
  BLOQUEADA e o orquestrador replanejava em torno de uma pergunta já respondida. O campo
  `lastSeen.todoHuman` do `discord-state.json` existe para isso e estava parado.
  **Desde 2026-08-15 isso não depende mais de memória**: o hook `SessionStart` roda
  `tools/colher-respostas.mjs`, que varre as pendências ABERTAS do `discord-state.json`
  (aberta = sem `status` RESOLVIDO/RESPONDIDO/AUTORIZADO e `modo` diferente de "so aviso"),
  lê as reações do humano — só o `doHumano` conta, o 👀 do próprio bot é ack — e as mensagens
  novas depois do `lastSeen.todoHuman`. O resultado chega no contexto no início da sessão.
  O que continua sendo trabalho do orquestrador: **transcrever** para o campo "Resposta do
  humano" do `TODO-HUMANO.md` antes de escolher a próxima tarefa, e atualizar o `lastSeen`.
  Se a linha disser "não consegui ler o Discord", colha à mão com `bridge.mjs reactions` —
  o script degrada de propósito em vez de travar a sessão, e silêncio dele não é "sem resposta".
- **Migração destrutiva vai em duas etapas, com o humano confirmando entre elas** (regra
  criada na T-091b, 2026-08-14): a etapa 1 tira o recurso da **UI e da API** sem apagar uma
  linha; a etapa 2 dropa o dado, e **só roda com confirmação explícita** depois de o humano
  ver o app sem o recurso. Entre as duas, desfazer é reverter código; depois da segunda, não
  há desfazer — não existe backup do `wallet.db`. A etapa 2 leva **dump para fora do repo**
  (que é público) como passo da tarefa, salvo recusa explícita do humano.
- **Discord é interface, não fonte da verdade.** `BACKLOG.md` e `TODO-HUMANO.md` continuam
  sendo o estado real; as mensagens são espelhos editáveis. Divergiu? O markdown ganha.
- **Dado sensível não atravessa a ponte.** Valor real de conta do humano, saldo, nome de
  estabelecimento, id de conta/item, credencial: nada disso vai para o Discord (nem para
  arquivo versionado — ver `CLAUDE.md` da raiz). Descreva relativo: "a maior parte do débito
  do mês", nunca o número. Uma mensagem já postada com dado assim precisa de `edit`, e o
  `edit` **não** notifica — então o vazamento fica silencioso se ninguém olhar.
- **Só o orquestrador escreve no Discord e em `discord-state.json`** — mesma regra do
  `BACKLOG.md`, para não haver conflito de escrita entre worktrees. Executores seguem
  reportando ao orquestrador. Continua sendo regra de prompt, não trava — nunca foi violada
  (ver "Travas executáveis" sobre o hook que foi criado para isto e removido no mesmo dia).
- O humano confirma por reação (✅ aprova · ❌ recusa · 🔁 refaz) ou por resposta em texto;
  o orquestrador transcreve a resposta para o campo "Resposta do humano" do `TODO-HUMANO.md`,
  que segue sendo o registro permanente da decisão.
- **Ao fechar uma onda de tarefas, atualize o `#docs-app`** (mensagem única, editada) com o
  resumo legível do app. É vista derivada dos `CLAUDE.md` de package e de `docs/decisions/` —
  nunca uma quarta cópia de "o que o app é". Se divergir do repo, o repo ganha.

## O loop fechado

```
┌─────────────────────────────────────────────────────────┐
│ 0. COLHER RESPOSTAS — automático desde 2026-08-15        │
│    O hook SessionStart roda tools/colher-respostas.mjs   │
│    e injeta reações/respostas novas no contexto.         │
│    Achou? transcreve para o markdown, atualiza o         │
│    lastSeen e a tarefa BLOQUEADA volta à fila.           │
│    Degradou ("não consegui ler")? colha à mão.           │
│                        │                                 │
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
│    3ª REPROVADA encerra: BLOQUEADA + TODO-HUMANO.md.     │
│                        │                                 │
│ 5. INTEGRAR (orquestrador)                               │
│    Atualiza status no BACKLOG.md, consolida resultados,  │
│    reporta ao humano, abre PR e faz merge (modo auto —   │
│    autorização permanente do humano, 2026-07-24).        │
│    O gate é o CHECK VERDE do CI, nunca o relatório.      │
│                        │                                 │
│ 6. FECHAR O LOOP                                         │
│    Orquestrador reavalia prioridades com o que aprendeu  │
│    e volta ao passo 1.                                   │
└─────────────────────────────────────────────────────────┘
```

## Travas executáveis — e a regra que as cria

> **Regra em prosa violada duas vezes não vira parágrafo novo: vira trava executável.**
> (2026-08-15) Já aconteceu três vezes aqui, e nas três a segunda tentativa em prosa também
> falhou: o backlog chegou a 78 KB com a regra de higiene escrita desde o ciclo 1; o espelho do
> Discord ficou parado no mesmo dia em que a regra de espelhar foi escrita; a resposta da T-091b
> ficou dois dias parada com o passo 0 já documentado. Prosa é instrução **soft** — esperada, não
> forçada. Quando a mesma regra falha duas vezes, o problema não é redação, é camada: ela precisa
> descer para o CI (se houver commit a inspecionar) ou para um hook (se o dano acontece dentro da
> sessão, antes de existir commit).

| Trava | Onde roda | O que impede |
|---|---|---|
| `pnpm backlog:check` | CI | backlog acima de 8 KB ou tarefa CONCLUIDA parada nele |
| `pnpm discord:check` | CI | commit em `BACKLOG.md`/`TODO-HUMANO.md` mais novo que o espelho |
| `tools/colher-respostas.mjs` | hook `SessionStart` | o passo 0 depender de o orquestrador lembrar |
| ruleset "main protegida" | GitHub | `non_fast_forward` e `deletion` na `main` |

O hook vive em [`.claude/settings.json`](../../.claude/settings.json) e **vale automaticamente** —
settings de projeto são carregados sob o *workspace trust* da pasta, e edição direta no arquivo é
pega pelo file watcher na sessão em curso, sem reiniciar. Não há passo de aceite: `/hooks` é um
**navegador read-only** (mostra evento, matcher, comando e de qual settings veio) e serve para
auditar, não para aprovar. Ele **falha aberto**: erro próprio libera e imprime que degradou. Um
guard de higiene que trava a sessão por bug próprio custa mais que a regra que ele protege. (Quem
falha *fechado* é o gate `ENVIRONMENT` da Pluggy — lá o desfecho de um typo seria violar
contrato, não perder higiene.)

**O critério tem lado negativo, e ele foi exercido no mesmo dia.** Junto com o hook do passo 0
nasceu um segundo, `PreToolUse`, que bloqueava worktree de escrever em `BACKLOG.md`,
`discord-state.json` e no Discord. Foi **removido horas depois**, a pedido do humano, por não
passar no próprio critério: essa regra nunca foi violada — nenhuma vez, muito menos duas. Era
trava para falha hipotética, exatamente o "existir prematuramente" que o custo de um graph
prematuro cobra. E o preço era real: `PreToolUse` em `Write|Edit|Bash` paga **~264 ms de startup
do Node por chamada** (Windows), em toda edição de toda sessão. A regra voltou para onde já
funcionava, o prompt do executor. Se um dia um executor de fato escrever no backlog de dentro de
um worktree, ela cumpre o critério e a trava volta — aí com o custo justificado.

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
- **Teto de 3 ciclos por tarefa** (2026-08-15). A 3ª REPROVADA **encerra a tentativa**: a tarefa vira `BLOQUEADA`, vai para o `TODO-HUMANO.md` com os achados das três revisões, e o orquestrador segue para a próxima da fila. Não existe 4ª delegação automática. Motivo: o par executor↔revisor era a única alça do loop **sem condição de parada** — 3 reprovações não são um modelo fraco, são a tarefa mal especificada ou uma decisão de produto disfarçada de bug (foi o caso da T-053, onde a instrução do orquestrador é que estava errada). Um modelo maior não conserta especificação ruim, só a executa mais caro.
- **Spike de design (opcional, recomendado para alta)**: antes de delegar uma tarefa alta, o orquestrador pode spawnar o agente `Plan` com `model: "opus"` para produzir plano de implementação (arquivos-alvo, abordagem, riscos, casos de borda). O plano entra na íntegra no prompt do executor — reduz retrabalho e permite até executar em Sonnet com plano de Opus quando o desafio é de *design*, não de *execução*.
- **Na dúvida entre média e alta, escolha alta.** O custo extra de Opus numa tarefa é menor que um ciclo executar→reprovar→corrigir→re-revisar.
- **O que a evidência dos ciclos 1–20 diz** ([`CALIBRAGEM.md`](./CALIBRAGEM.md)): nenhuma reprovação caiu em cálculo financeiro (essas foram para Opus e passaram) — todas caíram em **estado assíncrono, gates de render e consistência entre N arquivos**, que é onde lint, build e suíte passam verdes com o código errado. Haiku nunca errou código, mas errou um **relatório** (T-095): com Haiku, confira o diff, não a prosa.
- Ao concluir, o modelo usado e o veredito vão para o **corpo da PR**; só o que muda decisão futura de roteamento entra em `CALIBRAGEM.md`. Nada disso volta para o `BACKLOG.md`.
- **Mexeu no prompt de um agente, registre e confira** (2026-08-15). `.claude/agents/executor.md` e `revisor.md` são a peça que mais muda comportamento por caractere alterado, e até aqui mudavam sem deixar rastro do *porquê*. Toda alteração neles: (1) uma linha em `CALIBRAGEM.md` § "Versões dos prompts" — data, o que mudou, a evidência que motivou; (2) antes de aceitar, passe o prompt novo por **duas linhas** do dataset de regressão (as 9 reprovações, no mesmo arquivo) e confirme que ele ainda pegaria aquele achado. Um prompt que ganha uma regra nova e perde uma antiga é o modo de falha silencioso do fluxo — a suíte de testes do app não vê nada disso.

## O predicado de sucesso é o check verde, não o relatório

O que fecha uma tarefa é **evidência**, não a afirmação de que ela terminou. Concretamente:

- O orquestrador **não aceita "testes passaram"** vindo do relatório do executor nem do revisor. O gate é o **check do CI na PR** (`pnpm build`, `lint`, `format:check`, `backlog:check`, `discord:check`, `pnpm test`). Relatório vale para saber *o que foi feito* e *o que ficou de fora*; não vale como prova de que funciona.
- Isso já mordeu: na **T-095** o Haiku entregou o código certo e o **relatório errado** — alegou uma falha que não existia. Se o veredito dependesse da prosa, a tarefa teria sido rejeitada por um problema inventado.
- **Merge com CI vermelho continua tecnicamente possível** (o ruleset é o nível mínimo — ver `TODO-HUMANO.md`, 2026-08-10). Enquanto for, esta regra é a única coisa entre um relatório otimista e a `main`: **espere o check** antes do merge.
- **Risco que nenhum teste cobre exige execução, não leitura** — o `snapshotScheduler` roda no boot e nenhum teste pega se ele parar de ser chamado (T-099c). Nesses pontos, a evidência é subir o código e observar; ler o diff não é evidência.

## Regras de paralelismo (multi-branch)

- Cada tarefa delegada roda com **`isolation: "worktree"`** na ferramenta Agent — o executor recebe um git worktree próprio e não conflita com outros executores.
- O orquestrador só paraleliza tarefas **sem dependência entre si** (marcadas no `BACKLOG.md`). Tarefas que tocam os mesmos arquivos rodam em série.
- Alternativa manual (fora do Claude Code): `git worktree add ../vetor-wallet-<tarefa> -b feat/<tarefa>` e uma sessão `claude` em cada diretório.

## Regras de comunicação

- **Executores nunca perguntam ao humano diretamente** — registram a dúvida no `TODO-HUMANO.md` e devolvem a tarefa como `BLOQUEADA` com o motivo.
- **Executores devolvem dados, não prosa** — o retorno final do subagente deve dizer: o que foi feito, arquivos alterados, testes rodados (comando + resultado), e pendências.
- **O orquestrador é o único que escreve no `BACKLOG.md`** — executores reportam; orquestrador atualiza status. Evita conflito de escrita entre worktrees.
- Toda mudança de produto segue a **política de testes do CLAUDE.md**: teste automatizado ou justificativa explícita.

## Ciclos concluídos

Movida do `BACKLOG.md` em 2026-08-12: pela própria regra de higiene, trabalho concluído não
ocupa o backlog — e o arquivo estava a 147 bytes do teto. Detalhe de cada tarefa vive nas PRs
e no `git log`; calibragem de modelos, em `CALIBRAGEM.md`.

| Ciclo | Tema | PRs |
| --- | --- | --- |
| 1–4 | Paleta, responsividade, refactor v4 multi-layer, robustez, P&L diário | #44–#62 |
| 5–8 | Layers básicos, edição inline, renda variável, simulador, transferência poupança→meta | #63–#83 |
| 9–12 | Endurecimento (datas, transação, sessões, `user_id`), carteira única, rigor monetário, dash de ações | #84–#106 |
| 13–15 | Agendador de snapshots, benchmarks CDI/IBOV, monetização (AbacatePay/Pix, planos, gating) | #107–#119 |
| 16 | Modo consulta nos layers + achados da revisão + importação OFX | #120–#132 |
| 17–18 | Ajustes de UX, redesign de planos, página `/conta` (perfil + troca de senha) | #134–#141 |
| 19 | **Arquitetura em módulos**: `packages/*-core`, config única de lint, Prettier no CI | #142–#150 |
| 20 | Formato-alvo dos cores (`subscription-core`, `validation-core`), rename `rest-api`, logo da marca | #151–#152 |
| 21 | Open Finance via Pluggy (`pluggy-core` + job `pluggy:sync`) | #159 |

## Estados de uma tarefa

`PENDENTE` → `EM_ANDAMENTO` → (`BLOQUEADA` ⇄) → `EM_REVISAO` → `CONCLUIDA` | `CANCELADA`
