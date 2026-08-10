# Bridge Discord — interface do fluxo multi-agente

Superfície de I/O do loop descrito em [`docs/multi-agent/README.md`](../../docs/multi-agent/README.md).
O Discord é **interface, não fonte da verdade**: `BACKLOG.md` e `TODO-HUMANO.md` continuam
sendo o estado real (versionado em git); as mensagens são espelhos editáveis deles.

Node puro com `fetch` nativo, **zero dependência** e fora do `pnpm-workspace` (que é só
`packages/*`, o app). Nada aqui é importado pelo produto.

## Setup (uma vez)

1. https://discord.com/developers/applications → **New Application**.
2. **Bot** → **Reset Token** → copiar (aparece uma única vez).
3. Ainda em **Bot** → ligar **MESSAGE CONTENT INTENT** (sem isso o `content` das
   mensagens do humano volta vazio).
4. **OAuth2 → URL Generator** → scope `bot` → permissões: View Channels, Send Messages,
   Embed Links, Read Message History, Add Reactions, Manage Messages. Abrir a URL gerada e
   adicionar o bot ao servidor.
5. Discord → Configurações → Avançado → **Modo desenvolvedor**; botão direito em cada
   canal → **Copiar ID**.
6. `cp tools/discord/.env.example tools/discord/.env` e preencher.
7. Sanidade: `node tools/discord/bridge.mjs whoami`.

## Comandos

```bash
node tools/discord/bridge.mjs whoami
node tools/discord/bridge.mjs post <canal> <arquivo|-> [--embed] [--title T] [--mention] [--reply-to <id>]
node tools/discord/bridge.mjs edit <canal> <messageId> <arquivo|-> [--embed] [--title T]
node tools/discord/bridge.mjs read <canal> [--after <messageId>] [--limit N]
node tools/discord/bridge.mjs reactions <canal> <messageId>
node tools/discord/bridge.mjs react <canal> <messageId> <emoji>
```

`<canal>` aceita apelido (`new-tasks`, `backlog`, `todo-ai`, `todo-human`) ou ID cru.
Toda saída é JSON no stdout — o orquestrador consome direto.

**Limites que o script impõe** (falha explícita, não trunca): mensagem simples 2000
caracteres, embed 4096. Conteúdo longo — espelho do backlog, resumo de ciclo — vai com
`--embed`. Rate limit (429) tem retry automático até 3 vezes.

**`reactions` só conta reação de gente.** O próprio bot reage 👀 como ack de leitura; se a
contagem crua valesse como decisão, o ack viraria aprovação. A saída traz `doHumano`, que é
o único campo que o orquestrador pode tratar como decisão.

## Notificar × editar

O Discord dispara notificação **na criação** da mensagem, nunca na edição. Menção adicionada
por edição **não pinga** — o texto muda, o `@` aparece e nenhum aviso sai. Por isso:

- **progresso rotineiro** (`EM_ANDAMENTO → EM_REVISAO`) → `edit`, silencioso, canal limpo;
- **precisa do humano** (`BLOQUEADA`, pedido de aprovação, ciclo fechado) → `post --mention
  --reply-to <id da mensagem de status>`: mensagem nova (notifica de verdade) e agrupada
  como resposta (não polui).

`edit --mention` falha de propósito, com essa explicação na mensagem de erro.

## Protocolo dos canais

| Canal | Escreve | Como funciona |
|---|---|---|
| `#new-tasks` | humano | texto livre. O orquestrador lê com `read --after <lastSeen>`, reage 👀 (li) e ✅ (virou tarefa), e responde com o ID `T-XXX` atribuído |
| `#backlog` | orquestrador | **uma** mensagem-embed editada a cada ciclo, espelho da fila do `BACKLOG.md` |
| `#todo-ai` | orquestrador | uma mensagem por tarefa, editada nas transições de status; link do PR ao fim |
| `#todo-human` | orquestrador pergunta, humano responde | uma mensagem por pendência aberta do `TODO-HUMANO.md` |
| `#docs-app` | orquestrador | **uma** mensagem-embed com o resumo legível do app, **editada ao fim de cada onda de tarefas**. É vista derivada, não fonte: o estado real são os `CLAUDE.md` de package e `docs/decisions/`. Nunca vira um quarto lugar onde "o que o app é" está escrito — se divergir do repo, o repo ganha |

### Como o orquestrador pede resposta

Toda mensagem de `#todo-human` **declara na última linha** o que ela precisa. São só dois modos:

```
**Responder**: só emoji — ✅ aprovo · ❌ não
**Responder**: emoji + resposta — ✅/❌ e me diga o porquê (vai virar registro de decisão)
```

- **Só emoji** quando a pergunta é um bit fechado e o "porquê" não muda nada depois.
- **Emoji + resposta** quando o motivo vira registro: o texto é transcrito para o campo
  "Resposta do humano" do `TODO-HUMANO.md`, que é o que sobrevive e vira memória do projeto.
  O emoji dá a decisão; a resposta dá o porquê. O `read` devolve `replyTo`, então a resposta
  é amarrada à pendência exata, sem adivinhação.

**Uma mensagem = uma decisão.** Reação é um bit; pendência multi-parte torna o ✅ ambíguo.
Quando houver mais de duas saídas, emoji distinto por opção (1️⃣2️⃣3️⃣) com o mapa escrito na
própria mensagem.

Os IDs das mensagens fixas ficam em [`docs/multi-agent/discord-state.json`](../../docs/multi-agent/discord-state.json),
escrito **só pelo orquestrador** (mesma regra do `BACKLOG.md` — evita conflito entre worktrees).

## Daemon — o fluxo dispara sozinho

```bash
node tools/discord/daemon.mjs --dry-run   # loga o que faria, sem executar nada
node tools/discord/daemon.mjs             # pra valer
```

Mantém aberta a conexão **Gateway** (WebSocket) do Discord e traduz "mensagem nova no
`#new-tasks`" em "agente rodando". Zero dependência — `WebSocket` é global no Node 22+.

**Por que Gateway e não webhook**: o Discord tem dois caminhos de push. O *Interactions
Endpoint* faz POST numa URL sua (é para isso que serve a Public Key da aplicação), mas só
entrega slash command, botão e modal — **mensagem de texto comum não passa por lá**. Para
reagir ao que o humano escreve, só o Gateway serve, e ele exige um processo sempre ligado.

### As cinco travas

1. **Autoria** — só mensagem do `DISCORD_HUMAN_ID`, só no `#new-tasks`.
2. **Serial** — um agente por vez. Dois merges concorrentes na `main` é problema garantido,
   e worktree isolado não protege contra isso.
3. **Custo** — a classificação roda em **Haiku** e em `--permission-mode plan` (não escreve
   nada). Se sair **alta** (executor Opus), o daemon **não dispara**: pergunta no
   `#todo-human` e espera ✅. Baixa e média executam e mergeiam sozinhas.
4. **Notificação** — toda integração (e toda falha) vai para o `#todo-ai` com menção.
5. **Pausa** — escrever `pausar` no `#new-tasks` congela a fila; `retomar` libera.

### O que isso significa de verdade

A fase de execução roda com **`--permission-mode bypassPermissions`**: um agente com
liberdade de rodar qualquer comando na máquina, disparado por uma mensagem de Discord. É a
natureza do que um daemon autônomo é, não um detalhe de implementação. `FERRAMENTAS_NEGADAS`
no topo do arquivo cobre os acidentes mais óbvios (`rm -rf`, `push --force`, `reset --hard`)
— é **guarda-corpo, não sandbox**.

Se o daemon morrer no meio de uma tarefa, o processo filho morre junto e pode sobrar uma
branch/worktree pela metade. Nada é mergeado sem passar pelo revisor, então o pior caso é
lixo a limpar, não código ruim na `main`.

## Sem o daemon

Com o daemon parado, o modelo é **pull**: o orquestrador roda `read --after <lastSeen>` ao
abrir a sessão e processa tudo que chegou. Nada se perde — só não há reação em tempo real.
