#!/usr/bin/env node
// Bridge Discord <-> fluxo multi-agente. I/O puro: posta, edita, le mensagens e
// reacoes. NAO tem logica de estado — o mapa tarefa -> message_id vive em
// docs/multi-agent/discord-state.json e quem escreve nele e o orquestrador.
//
// Uso: node tools/discord/bridge.mjs <comando> [args]   (ver README.md)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://discord.com/api/v10';
const here = dirname(fileURLToPath(import.meta.url));

/** Le tools/discord/.env sem dependencia externa (KEY=valor, # comenta). */
function loadEnv() {
  let raw;
  try {
    raw = readFileSync(join(here, '.env'), 'utf8');
  } catch {
    return; // .env ausente: aceita variaveis ja exportadas no ambiente
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

/**
 * Erro de uso/API. Lanca em vez de process.exit(): sair abruptamente com um fetch
 * em voo derruba o libuv no Windows ("Assertion failed ... uv_handle_closing").
 */
class BridgeError extends Error {}
function fail(message) {
  throw new BridgeError(message);
}

/** Aceita apelido do canal (backlog, todo-ai, ...) ou um ID cru. */
function resolveChannel(nameOrId) {
  if (!nameOrId) fail('canal nao informado');
  if (/^\d{17,20}$/.test(nameOrId)) return nameOrId;
  const key = `DISCORD_CHANNEL_${nameOrId.toUpperCase().replace(/-/g, '_')}`;
  const id = process.env[key];
  if (!id) fail(`canal "${nameOrId}" nao mapeado — defina ${key} no tools/discord/.env`);
  return id;
}

/** Chamada a API com retry no rate limit (429 devolve retry_after em segundos). */
async function api(method, path, body) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) fail('DISCORD_BOT_TOKEN ausente — veja tools/discord/.env.example');

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'VetorWalletBridge (https://github.com/GiovaneGuimaraes/vetor-wallet, 1.0)',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 429 && attempt < 3) {
      const { retry_after: retryAfter = 1 } = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, Math.ceil(retryAfter * 1000) + 250));
      continue;
    }
    if (!res.ok) fail(`${method} ${path} -> ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
}

/** Conteudo vindo de arquivo, ou de stdin quando o argumento e "-". */
function readContent(source) {
  if (!source) fail('conteudo nao informado (caminho de arquivo ou "-" para stdin)');
  return readFileSync(source === '-' ? 0 : source, 'utf8');
}

/**
 * Mensagem simples estoura em 2000 caracteres; embed aceita 4096 na descricao.
 * Por isso texto longo (backlog, status de ciclo) sempre vai como embed.
 *
 * --mention: o Discord NAO notifica em edicao de mensagem, so na criacao. Entao
 * mencao que precisa pingar tem que ir numa mensagem NOVA (tipicamente um
 * --reply-to da mensagem de status), nunca editando a mensagem existente.
 */
function buildPayload(content, { embed, title, mention, replyTo }) {
  const payload = {};

  if (replyTo) payload.message_reference = { message_id: replyTo, fail_if_not_exists: false };

  let prefix = '';
  if (mention) {
    const humanId = process.env.DISCORD_HUMAN_ID;
    if (!humanId) fail('--mention exige DISCORD_HUMAN_ID no tools/discord/.env');
    prefix = `<@${humanId}> `;
  }

  if (!embed) {
    const full = prefix + content;
    if (full.length > 2000) {
      fail(`conteudo tem ${full.length} caracteres (limite 2000) — use --embed`);
    }
    return { ...payload, content: full };
  }
  if (content.length > 4096) fail(`embed tem ${content.length} caracteres (limite 4096)`);
  // Mencao dentro de embed nao notifica; por isso ela vai no content, fora dele.
  return {
    ...payload,
    content: prefix,
    embeds: [{ description: content, ...(title ? { title } : {}), color: 0xa8814f }],
  };
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
  /** post <canal> <arquivo|-> [--embed] [--title T] -> imprime o id da mensagem */
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
          'Para pingar, poste mensagem nova com --mention --reply-to ' +
          messageId,
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

  /** reactions <canal> <messageId> — quem reagiu com o que (nome do emoji + usuarios) */
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
