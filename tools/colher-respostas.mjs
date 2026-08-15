#!/usr/bin/env node
// Passo 0 do loop multi-agente: colher as respostas do humano no Discord ANTES
// de planejar. Roda como hook SessionStart (ver .claude/settings.json) e imprime
// o resultado no contexto da sessao.
//
// Por que virou script: a regra existia em prosa no README desde 2026-08-15 e
// depende de o orquestrador LEMBRAR de rodar `bridge.mjs reactions` em cada
// pendencia aberta. Regra que depende de memoria ja falhou tres vezes neste
// repo (backlog a 78 KB, espelho do Discord parado, resposta da T-091b parada
// dois dias) — as duas primeiras viraram guard no CI, esta vira hook.
//
// CONTRATO DE FALHA: este script NUNCA reprova nem trava a sessao. Sem token,
// sem rede ou com o Discord fora, ele imprime que degradou e sai com 0 — um
// passo 0 que quebra a sessao seria pior que o passo 0 manual.
//
// Uso avulso: pnpm colher:respostas

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, loadEnv, resolveChannel } from './discord/api.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESTADO = join(raiz, 'docs', 'multi-agent', 'discord-state.json');
const TIMEOUT_MS = 20_000;

/** Status que fecham a pendencia — o resto conta como aberta. */
const FECHADOS = /^(RESOLVIDO|RESPONDIDO|AUTORIZADO)/i;

/**
 * Worktree vinculado tem `.git` como ARQUIVO; o repo principal, como diretorio.
 * Executor roda em worktree e nao colhe resposta nenhuma — quem fala com o
 * humano e so o orquestrador.
 */
function emWorktree(dir) {
  try {
    return statSync(join(dir, '.git')).isFile();
  } catch {
    return false;
  }
}

function pendenciasAbertas(estado) {
  return Object.entries(estado.humanTodos ?? {})
    .filter(([, p]) => p.modo !== 'so aviso' && !FECHADOS.test(p.status ?? ''))
    .map(([chave, p]) => ({ chave, canal: p.canal ?? 'todo-human', messageId: p.messageId }));
}

/** Reacoes do humano numa pendencia. O 👀 do proprio bot e ack, nao decisao. */
async function reacoesDoHumano(canalId, messageId) {
  const msg = await api('GET', `/channels/${canalId}/messages/${messageId}`);
  const humanId = process.env.DISCORD_HUMAN_ID;
  const achados = [];
  for (const r of msg.reactions ?? []) {
    const chave = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name;
    const users = await api(
      'GET',
      `/channels/${canalId}/messages/${messageId}/reactions/${encodeURIComponent(chave)}`,
    );
    const humanos = users.filter((u) => !u.bot);
    if (!humanos.length) continue;
    if (humanId && !humanos.some((u) => u.id === humanId)) continue;
    achados.push(r.emoji.name);
  }
  return achados;
}

async function colher() {
  loadEnv();
  const estado = JSON.parse(readFileSync(ESTADO, 'utf8'));
  const canalId = resolveChannel('todo-human');
  const linhas = [];

  const abertas = pendenciasAbertas(estado);
  for (const p of abertas) {
    if (!p.messageId) continue;
    const emojis = await reacoesDoHumano(canalId, p.messageId);
    if (emojis.length) linhas.push(`- REAGIU ${emojis.join(' ')} em **${p.chave}**`);
  }

  const desde = estado.lastSeen?.todoHuman;
  const params = new URLSearchParams({ limit: '25', ...(desde ? { after: desde } : {}) });
  const msgs = await api('GET', `/channels/${canalId}/messages?${params}`);
  for (const m of msgs.reverse().filter((m) => !m.author?.bot && m.content?.trim())) {
    linhas.push(`- ESCREVEU (${m.id}): ${m.content.replace(/\s+/g, ' ').slice(0, 300)}`);
  }

  return { linhas, abertas: abertas.length, ultimaMsg: msgs.at(-1)?.id };
}

function saida(texto) {
  process.stdout.write(`${texto}\n`);
}

if (emWorktree(process.cwd())) process.exit(0);

try {
  const r = await Promise.race([
    colher(),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
  ]);

  if (!r.linhas.length) {
    saida(
      `[passo 0] ${r.abertas} pendência(s) aguardando resposta, nenhuma reação ou mensagem nova do humano.`,
    );
  } else {
    saida(
      [
        '[passo 0 — RESPOSTA DO HUMANO ENCONTRADA NO DISCORD]',
        ...r.linhas,
        '',
        'Antes de escolher a próxima tarefa: transcreva isto para o campo "Resposta do humano"',
        'em docs/multi-agent/TODO-HUMANO.md, atualize lastSeen.todoHuman em discord-state.json',
        `${r.ultimaMsg ? `(última mensagem lida: ${r.ultimaMsg})` : ''} e devolva a tarefa BLOQUEADA para a fila.`,
      ].join('\n'),
    );
  }
} catch (err) {
  // Degrada avisando: silencio faria o orquestrador achar que nao ha resposta.
  saida(`[passo 0] não consegui ler o Discord (${err.message}). Colha à mão com \`bridge.mjs reactions\`.`);
}
