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
| [`CONTA-DE-TESTE.md`](./CONTA-DE-TESTE.md) | Humano | Como o agente usa a conta de teste do Cognito de staging (sem o valor das credenciais — o repo é público) |
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
- **Objetivo**: o que fazer.
- **Propósito**: o estado final que a tarefa serve e por quê (1 linha).
- **Fora de escopo**: o que NÃO entra, mesmo parecendo vizinho.
- **Arquivos-alvo**: caminhos prováveis.
- **Critério de aceite**: verificável + comando de teste.
- **Evidência de fechamento** (só se o risco não for coberto por teste): o que o executor roda
  no app e cola no relatório — ver abaixo.
```

**Por que `Propósito` e `Fora de escopo` existem** (2026-11-08, artigo do Addy Osmani + princípio
9 do ttoss): critério de aceite sozinho é um proxy que o agente satisfaz ao pé da letra; o
propósito é a regra de decisão que ele carrega para as escolhas que o brief não previu — sem ele
preenche a lacuna com um palpite que parece resposta. T-053 foi a instrução do orquestrador
errada, e T-091c2 um efeito colateral que o aceite não previa. Ambos eram problema de brief.

### Evidência de fechamento: rodar o app, não só a suíte

Para tarefa nas classes que nos reprovam (estado assíncrono, gates de render, consistência entre
N arquivos) ou que muda algo que nenhum teste vê (processo de boot, job, scheduler), o brief diz
em **Evidência de fechamento** o que rodar. O executor sobe o app com a conta de teste
([`CONTA-DE-TESTE.md`](./CONTA-DE-TESTE.md)), exercita a mudança e cola no relatório o comando, o
resultado real e as linhas de log do app que mostram o efeito (o logger estruturado — T-122). O
revisor repete **uma** dessas chamadas por conta própria. Não é para toda tarefa: docs, estilo e
refactor sem mudança de comportamento ficam de fora, e sem conta de teste disponível o relatório
diz que a evidência de runtime não foi coletada.

## Estado e comunicação ficam no repo

O loop **não tem superfície externa**. Todo o estado vive em arquivos versionados que o agente lê
direto, sem rede: `BACKLOG.md` (fila), `TODO-HUMANO.md` (pendências do humano) e os `CLAUDE.md`.
Havia um espelho no Discord (5 canais, `bridge.mjs`, `discord-guard`, hook de leitura de
reações); foi **removido em 2026-11-04** por ser uma segunda cópia do estado, que cobrava fetch a
cada sessão e um guard no CI para não divergir. Está no git se o cenário mudar
(`git log -- tools/discord`). O formato que o substitui (blocos de nota dentro do repo) ainda
está por definir.

Regras que valem sempre:

- **O humano responde no `TODO-HUMANO.md`** (campo "Resposta do humano") ou na conversa da
  sessão. No início de cada sessão o orquestrador lê o arquivo: pendência com resposta e tarefa
  `BLOQUEADA` por ela → a tarefa volta à fila antes de escolher a próxima.
- **Migração destrutiva vai em duas etapas, com o humano confirmando entre elas** (regra
  criada na T-091b, 2026-08-14): a etapa 1 tira o recurso da **UI e da API** sem apagar uma
  linha; a etapa 2 dropa o dado, e **só roda com confirmação explícita** depois de o humano
  ver o app sem o recurso. Entre as duas, desfazer é reverter código; depois da segunda, não
  há desfazer — não existe backup do `wallet.db`. A etapa 2 leva **dump para fora do repo**
  (que é público) como passo da tarefa, salvo recusa explícita do humano.
- **Dado sensível não entra em arquivo versionado, PR nem commit.** Valor real de conta do
  humano, saldo, nome de estabelecimento, id de conta/item, credencial — ver `CLAUDE.md` da
  raiz. Descreva relativo: "a maior parte do débito do mês", nunca o número.
- **Só o orquestrador escreve no `BACKLOG.md`** — para não haver conflito de escrita entre
  worktrees. Executores reportam ao orquestrador. Continua sendo regra de prompt, não trava —
  nunca foi violada (ver "Travas executáveis" sobre o hook que foi criado para isto e removido
  no mesmo dia).

## O loop fechado

```
┌─────────────────────────────────────────────────────────┐
│ 0. LER RESPOSTAS — início de cada sessão                │
│    Lê o TODO-HUMANO.md. Pendência com "Resposta do      │
│    humano" preenchida? A tarefa BLOQUEADA por ela       │
│    volta à fila antes de escolher a próxima.            │
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
| ruleset "main protegida" | GitHub | `non_fast_forward` e `deletion` na `main` |

**O critério tem lado negativo, e ele foi exercido no mesmo dia.** Em 2026-08-15 nasceu um hook
`PreToolUse` que bloqueava worktree de escrever em `BACKLOG.md`, `discord-state.json` e no
Discord. Foi **removido horas depois**, a pedido do humano, por não passar no próprio critério: essa regra nunca foi violada — nenhuma vez, muito menos duas. Era
trava para falha hipotética, exatamente o "existir prematuramente" que o custo de um graph
prematuro cobra. E o preço era real: `PreToolUse` em `Write|Edit|Bash` paga **~264 ms de startup
do Node por chamada** (Windows), em toda edição de toda sessão. A regra voltou para onde já
funcionava, o prompt do executor. Se um dia um executor de fato escrever no backlog de dentro de
um worktree, ela cumpre o critério e a trava volta — aí com o custo justificado.

(O hook `SessionStart` que lia as respostas do Discord no passo 0 saiu em 2026-11-04, junto com
a integração: sem Discord, o passo 0 é ler o `TODO-HUMANO.md`, que já está no repo.)

## Roteamento de modelos (quem roda em quê)

O orquestrador classifica cada tarefa do `BACKLOG.md` com um campo **Complexidade** e escolhe o modelo do executor/revisor pelo parâmetro `model` da ferramenta Agent (que sobrepõe o default do frontmatter do subagente).

| Complexidade | Sinais típicos | Executor | Revisor |
|---|---|---|---|
| **baixa** | mudança mecânica/repetitiva, docs, ajuste de estilo/CSS, renomear, asset estático | `haiku` (default) | `sonnet` (docs puros: `haiku`) |
| **média** | feature padrão sobre padrões existentes (nova rota espelhando outra, tela nova sobre API pronta, teste novo) | `sonnet` (default) | `sonnet` |
| **alta** | cálculo financeiro (preço médio, P&L, saldo), mudança de schema/migração, auth/isolamento por `user_id`, refactor multi-pacote (`shared`+`server`+`web`), lógica com muitos casos de borda, débito que já causou reprovação antes | `opus` | `sonnet` |

**Versão dos modelos (decisão do humano, 2026-10-21)**: os aliases `opus`/`sonnet`/`haiku` da ferramenta Agent devem resolver para a geração **5.5** (Opus 5.5 / Sonnet 5.5), não 5.1 — mais eficiente e mais barata na avaliação do humano. Onde este documento e os prompts dos agentes dizem "Opus"/"Sonnet" sem versão, leia-se "Opus 5.5"/"Sonnet 5.5". Se o ambiente de execução não resolver o alias para 5.5 automaticamente, o orquestrador fixa a versão explicitamente no parâmetro `model`.

Regras complementares:

- **Baixa roda em Haiku por decisão de custo (2026-08-01)** — "haiku ou sonnet" na prática virava sempre Sonnet; agora Haiku é o default para complexidade baixa. Critério de segurança: a tarefa baixa só pode ir para Haiku se **não** tocar lógica de negócio nem SQL (docs, CSS/estilo, rename, texto de UI, asset, config trivial). Tocou qualquer código com comportamento testável → classifique como média (Sonnet). O revisor continua Sonnet, exceto diffs 100% de docs/markdown, que podem ser revisados em Haiku.
- **Escalonamento Haiku → Sonnet**: 1 veredito REPROVADA em tarefa executada por Haiku já re-delega o próximo ciclo em Sonnet (não espere as 2 reprovações da regra do Opus).

- **Revisor é sempre Sonnet por decisão de custo do humano (2026-07-25)** — o Opus na revisão encareceu demais o loop. Exceções pontuais só com pedido explícito do humano. Se um revisor Sonnet se declarar inseguro num ponto de dinheiro/auth, o orquestrador pode verificar aquele ponto específico ele mesmo em vez de escalar o modelo.
- **Escalonamento automático**: 2 vereditos REPROVADA seguidos na mesma tarefa → o orquestrador re-delega o próximo ciclo com executor `opus`, incluindo no prompt o histórico dos achados das reprovações — **os veredictos originais do revisor e o diff, não um resumo do orquestrador**: um resumo de resumo é como o terceiro agente acaba sem ter lido o que importava (artigo do Addy, 2026-11-08).
- **Teto de 3 ciclos por tarefa** (2026-08-15). A 3ª REPROVADA **encerra a tentativa**: a tarefa vira `BLOQUEADA`, vai para o `TODO-HUMANO.md` com os achados das três revisões, e o orquestrador segue para a próxima da fila. Não existe 4ª delegação automática. Motivo: o par executor↔revisor era a única alça do loop **sem condição de parada** — 3 reprovações não são um modelo fraco, são a tarefa mal especificada ou uma decisão de produto disfarçada de bug (foi o caso da T-053, onde a instrução do orquestrador é que estava errada). Um modelo maior não conserta especificação ruim, só a executa mais caro.
- **Spike de design (opcional, recomendado para alta)**: antes de delegar uma tarefa alta, o orquestrador pode spawnar o agente `Plan` com `model: "opus"` para produzir plano de implementação (arquivos-alvo, abordagem, riscos, casos de borda). O plano entra na íntegra no prompt do executor — reduz retrabalho e permite até executar em Sonnet com plano de Opus quando o desafio é de *design*, não de *execução*.
- **Na dúvida entre média e alta, escolha alta.** O custo extra de Opus numa tarefa é menor que um ciclo executar→reprovar→corrigir→re-revisar.
- **O que a evidência dos ciclos 1–20 diz** ([`CALIBRAGEM.md`](./CALIBRAGEM.md)): nenhuma reprovação caiu em cálculo financeiro (essas foram para Opus e passaram) — todas caíram em **estado assíncrono, gates de render e consistência entre N arquivos**, que é onde lint, build e suíte passam verdes com o código errado. Haiku nunca errou código, mas errou um **relatório** (T-095): com Haiku, confira o diff, não a prosa.
- Ao concluir, o modelo usado e o veredito vão para o **corpo da PR**; só o que muda decisão futura de roteamento entra em `CALIBRAGEM.md`. Nada disso volta para o `BACKLOG.md`.
- **Mexeu no prompt de um agente, registre e confira** (2026-08-15). `.claude/agents/executor.md` e `revisor.md` são a peça que mais muda comportamento por caractere alterado, e até aqui mudavam sem deixar rastro do *porquê*. Toda alteração neles: (1) uma linha em `CALIBRAGEM.md` § "Versões dos prompts" — data, o que mudou, a evidência que motivou; (2) antes de aceitar, passe o prompt novo por **duas linhas** do dataset de regressão (as 9 reprovações, no mesmo arquivo) e confirme que ele ainda pegaria aquele achado. Um prompt que ganha uma regra nova e perde uma antiga é o modo de falha silencioso do fluxo — a suíte de testes do app não vê nada disso.

## O predicado de sucesso é o check verde, não o relatório

O que fecha uma tarefa é **evidência**, não a afirmação de que ela terminou. Concretamente:

- O orquestrador **não aceita "testes passaram"** vindo do relatório do executor nem do revisor. O gate é o **check do CI na PR** (`pnpm build`, `lint`, `format:check`, `backlog:check`, `pnpm test`). Relatório vale para saber *o que foi feito* e *o que ficou de fora*; não vale como prova de que funciona.
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
