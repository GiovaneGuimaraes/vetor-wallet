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
node tools/discord/bridge.mjs post <canal> <arquivo|-> [--embed] [--title T]   # -> { id }
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

## Protocolo dos canais

| Canal | Escreve | Como funciona |
|---|---|---|
| `#new-tasks` | humano | texto livre. O orquestrador lê com `read --after <lastSeen>`, reage 👀 (li) e ✅ (virou tarefa), e responde com o ID `T-XXX` atribuído |
| `#backlog` | orquestrador | **uma** mensagem-embed editada a cada ciclo, espelho da fila do `BACKLOG.md` |
| `#todo-ai` | orquestrador | uma mensagem por tarefa, editada nas transições `PENDENTE → EM_ANDAMENTO → EM_REVISAO → CONCLUIDA`, com link do PR ao fim |
| `#todo-human` | orquestrador pergunta, humano responde | uma mensagem por pendência aberta do `TODO-HUMANO.md`. ✅ aprova · ❌ recusa · 🔁 refaz. Resposta em texto também vale — o orquestrador grava no campo "Resposta do humano" |

Os IDs das mensagens fixas ficam em [`docs/multi-agent/discord-state.json`](../../docs/multi-agent/discord-state.json),
escrito **só pelo orquestrador** (mesma regra do `BACKLOG.md` — evita conflito entre worktrees).

## Limite conhecido

O Claude Code não é um daemon: o bridge só roda dentro de uma sessão aberta. Mensagem
escrita no `#new-tasks` com a sessão fechada é vista na próxima abertura, via
`read --after`, e nada se perde — mas não há reação em tempo real. Um agente agendado
(`/schedule`) pluga nestes mesmos comandos sem retrabalho, se um dia valer o custo.
