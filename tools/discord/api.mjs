// Cliente HTTP do Discord, compartilhado entre o bridge (CLI) e o daemon.
// Nao ter duas copias disto e o ponto: token, rate limit e resolucao de canal
// mudam juntos.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API = 'https://discord.com/api/v10';
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Erro de uso/API. Lanca em vez de process.exit(): sair abruptamente com um fetch
 * em voo derruba o libuv no Windows ("Assertion failed ... uv_handle_closing").
 */
export class BridgeError extends Error {}
export function fail(message) {
  throw new BridgeError(message);
}

/** Le tools/discord/.env sem dependencia externa (KEY=valor, # comenta). */
export function loadEnv() {
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

export function token() {
  const t = process.env.DISCORD_BOT_TOKEN;
  if (!t) fail('DISCORD_BOT_TOKEN ausente — veja tools/discord/.env.example');
  return t;
}

/** Aceita apelido do canal (backlog, todo-ai, ...) ou um ID cru. */
export function resolveChannel(nameOrId) {
  if (!nameOrId) fail('canal nao informado');
  if (/^\d{17,20}$/.test(nameOrId)) return nameOrId;
  const key = `DISCORD_CHANNEL_${nameOrId.toUpperCase().replace(/-/g, '_')}`;
  const id = process.env[key];
  if (!id) fail(`canal "${nameOrId}" nao mapeado — defina ${key} no tools/discord/.env`);
  return id;
}

/** Mapa apelido -> id de todos os canais configurados (o daemon escuta estes). */
export function canaisConfigurados() {
  const mapa = {};
  for (const [k, v] of Object.entries(process.env)) {
    const m = /^DISCORD_CHANNEL_(.+)$/.exec(k);
    if (m && v) mapa[m[1].toLowerCase().replace(/_/g, '-')] = v;
  }
  return mapa;
}

/** Chamada a API com retry no rate limit (429 devolve retry_after em segundos). */
export async function api(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token()}`,
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

/**
 * Mensagem simples estoura em 2000 caracteres; embed aceita 4096 na descricao.
 *
 * mention: o Discord NAO notifica em edicao de mensagem, so na criacao. Entao
 * mencao que precisa pingar tem que ir numa mensagem NOVA (tipicamente um
 * replyTo da mensagem de status), nunca editando a mensagem existente.
 */
export function buildPayload(content, { embed, title, mention, replyTo } = {}) {
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
    if (full.length > 2000) fail(`conteudo tem ${full.length} caracteres (limite 2000) — use embed`);
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

export const postar = (canal, content, opts) =>
  api('POST', `/channels/${resolveChannel(canal)}/messages`, buildPayload(content, opts));

export const reagir = (canal, messageId, emoji) =>
  api(
    'PUT',
    `/channels/${resolveChannel(canal)}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
  );
