#!/usr/bin/env node
// Bridge Discord <-> fluxo multi-agente. I/O puro: posta, edita, le mensagens e
// reacoes. NAO tem logica de estado — o mapa tarefa -> message_id vive em
// docs/multi-agent/discord-state.json e quem escreve nele e o orquestrador.
//
// Uso: node tools/discord/bridge.mjs <comando> [args]   (ver README.md)

import { readFileSync } from 'node:fs';
import { api, BridgeError, buildPayload, fail, loadEnv, resolveChannel } from './api.mjs';

/** Conteudo vindo de arquivo, ou de stdin quando o argumento e "-". */
function readContent(source) {
  if (!source) fail('conteudo nao informado (caminho de arquivo ou "-" para stdin)');
  return readFileSync(source === '-' ? 0 : source, 'utf8');
}

function parseFlags(args) {
  const flags = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--embed') flags.embed = true;
    else if (args[i] === '--mention') flags.mention = true;
    else if (args[i] === '--title') flags.title = args[++i];
    else if (args[i] === '--reply-to') flags.replyTo = args[++i];
    else if (args[i] === '--after') flags.after = args[++i];
    else if (args[i] === '--limit') flags.limit = args[++i];
    else flags.positional.push(args[i]);
  }
  return flags;
}

const out = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

const commands = {
  /** post <canal> <arquivo|-> [--embed] [--title T] [--mention] [--reply-to id] */
  async post(args) {
    const f = parseFlags(args);
    const [channel, source] = f.positional;
    const msg = await api(
      'POST',
      `/channels/${resolveChannel(channel)}/messages`,
      buildPayload(readContent(source), f),
    );
    out({ id: msg.id, channelId: msg.channel_id });
  },

  /** edit <canal> <messageId> <arquivo|-> [--embed] [--title T] */
  async edit(args) {
    const f = parseFlags(args);
    const [channel, messageId, source] = f.positional;
    if (!messageId) fail('messageId nao informado');
    if (f.mention) {
      fail(
        'editar nao notifica: o Discord so dispara notificacao na criacao da mensagem. ' +
          `Para pingar, poste mensagem nova com --mention --reply-to ${messageId}`,
      );
    }
    const msg = await api(
      'PATCH',
      `/channels/${resolveChannel(channel)}/messages/${messageId}`,
      buildPayload(readContent(source), f),
    );
    out({ id: msg.id, editedAt: msg.edited_timestamp });
  },

  /** read <canal> [--after <messageId>] [--limit N] — mensagens em ordem cronologica */
  async read(args) {
    const f = parseFlags(args);
    const params = new URLSearchParams({ limit: f.limit ?? '25' });
    if (f.after) params.set('after', f.after);
    const messages = await api(
      'GET',
      `/channels/${resolveChannel(f.positional[0])}/messages?${params}`,
    );
    out(
      messages.reverse().map((m) => ({
        id: m.id,
        author: m.author?.username,
        bot: Boolean(m.author?.bot),
        timestamp: m.timestamp,
        content: m.content,
        replyTo: m.referenced_message?.id ?? null,
      })),
    );
  },

  /** reactions <canal> <messageId> — quem reagiu com o que (so gente, nunca bot) */
  async reactions(args) {
    const [channel, messageId] = parseFlags(args).positional;
    if (!messageId) fail('messageId nao informado');
    const channelId = resolveChannel(channel);
    const msg = await api('GET', `/channels/${channelId}/messages/${messageId}`);
    const result = [];
    for (const r of msg.reactions ?? []) {
      // Emoji custom vai como nome:id na URL; unicode vai so o caractere.
      const key = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name;
      const users = await api(
        'GET',
        `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(key)}`,
      );
      // O proprio bot reage (ack de leitura), entao contar reacao crua confundiria
      // ack com decisao. Só vale como decisao a reacao do humano configurado.
      const humanId = process.env.DISCORD_HUMAN_ID;
      const humanos = users.filter((u) => !u.bot);
      result.push({
        emoji: r.emoji.name,
        users: humanos.map((u) => ({ id: u.id, username: u.username })),
        doHumano: humanId ? humanos.some((u) => u.id === humanId) : null,
      });
    }
    out(result);
  },

  /** react <canal> <messageId> <emoji> — o bot reage (ack de leitura) */
  async react(args) {
    const [channel, messageId, emoji] = parseFlags(args).positional;
    if (!emoji) fail('emoji nao informado');
    await api(
      'PUT',
      `/channels/${resolveChannel(channel)}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    );
    out({ ok: true });
  },

  /** pin <canal> <messageId> — fixa a mensagem (instrucoes nao podem sumir no scroll) */
  async pin(args) {
    const [channel, messageId] = parseFlags(args).positional;
    if (!messageId) fail('messageId nao informado');
    await api('PUT', `/channels/${resolveChannel(channel)}/pins/${messageId}`);
    out({ ok: true });
  },

  /** whoami — sanidade: confirma que o token vale e mostra o bot autenticado */
  async whoami() {
    const me = await api('GET', '/users/@me');
    out({ id: me.id, username: me.username });
  },
};

try {
  loadEnv();
  const [command, ...rest] = process.argv.slice(2);
  if (!commands[command]) {
    fail(`comando desconhecido "${command ?? ''}" — use: ${Object.keys(commands).join(', ')}`);
  }
  await commands[command](rest);
} catch (err) {
  process.stderr.write(`erro: ${err instanceof BridgeError ? err.message : err.stack}\n`);
  process.exitCode = 1;
}
