#!/usr/bin/env node
// Daemon do Gateway: escuta o Discord e dispara o fluxo agentico.
//
// Por que existe: o Claude Code e um processo de terminal, nao um servidor. Sem
// algo sempre ligado, mensagem escrita com a sessao fechada so e vista quando o
// humano abre o terminal. Este processo mantem a conexao WebSocket do Discord
// aberta e traduz "mensagem nova" em "agente rodando".
//
// TRAVAS (decididas com o humano em 2026-08-09):
//  1. So reage a mensagem do DISCORD_HUMAN_ID, nos canais configurados.
//  2. Execucao SERIAL — um agente por vez. Dois merges concorrentes na main e
//     problema garantido, e worktree isolado nao protege contra isso.
//  3. Tarefa classificada como ALTA (executor Opus) NAO roda sozinha: pede ✅ no
//     #todo-human antes de gastar. Baixa/media roda e mergeia sozinha.
//  4. Toda integracao notifica o humano com mencao.
//  5. "pausar" / "retomar" no #new-tasks liga e desliga a fila.
//
// Uso: node tools/discord/daemon.mjs [--dry-run]

import { spawn } from 'node:child_process';
import { loadEnv, postar, reagir, resolveChannel } from './api.mjs';

loadEnv();

const DRY_RUN = process.argv.includes('--dry-run');
const HUMANO = process.env.DISCORD_HUMAN_ID;
if (!HUMANO) {
  process.stderr.write('erro: DISCORD_HUMAN_ID ausente — o daemon nao pode filtrar autoria\n');
  process.exit(1);
}

const CANAL_ENTRADA = resolveChannel('new-tasks');
const CANAL_DECISAO = resolveChannel('todo-human');
const CANAL_EXECUCAO = resolveChannel('todo-ai');

// GUILDS(1<<0) | GUILD_MESSAGES(1<<9) | GUILD_MESSAGE_REACTIONS(1<<10) | MESSAGE_CONTENT(1<<15)
const INTENTS = (1 << 0) | (1 << 9) | (1 << 10) | (1 << 15);

const MODELO_POR_COMPLEXIDADE = { baixa: 'haiku', média: 'sonnet', media: 'sonnet', alta: 'opus' };

// Guarda-corpo, nao sandbox: o agente roda com bypassPermissions e PODE fazer
// estrago. Estes padroes so cobrem os acidentes mais obvios.
const FERRAMENTAS_NEGADAS = ['Bash(rm -rf *)', 'Bash(git push --force*)', 'Bash(git reset --hard*)'];

const log = (...a) => process.stdout.write(`[${new Date().toISOString()}] ${a.join(' ')}\n`);

// ── estado ───────────────────────────────────────────────────────────────────
const fila = [];
let executando = false;
let pausado = false;
/** messageId da pergunta -> item aguardando ✅ do humano */
const aguardandoConfirmacao = new Map();

// ── disparo do Claude Code ───────────────────────────────────────────────────

/**
 * Roda o `claude` headless. O prompt vai por STDIN, nao por argv: prompts tem
 * aspas, quebras de linha e acentos, e passar isso por linha de comando no
 * Windows e fonte garantida de bug de quoting.
 */
function rodarClaude({ prompt, modelo, autonomo, texto }) {
  const args = ['-p', '--output-format', 'json', '--model', modelo];
  if (autonomo) {
    args.push('--permission-mode', 'bypassPermissions');
    for (const t of FERRAMENTAS_NEGADAS) args.push('--disallowedTools', t);
  } else {
    // Classificacao nao escreve nada; sem bypass, so leitura.
    args.push('--permission-mode', 'plan');
  }

  if (DRY_RUN) {
    log(`DRY-RUN claude ${args.join(' ')} (prompt: ${prompt.length} chars)`);
    // Devolve uma saida plausivel para o caminho INTEIRO ser exercitavel sem
    // gastar token. Escreva "alta" na mensagem para exercitar a trava de custo.
    if (!autonomo) {
      const complexidade = /alta/i.test(texto ?? '') ? 'alta' : 'média';
      return Promise.resolve({
        result: JSON.stringify({
          id: 'T-DRY',
          titulo: 'Tarefa simulada do dry-run',
          complexidade,
          justificativa: 'classificação simulada — nenhum modelo foi chamado',
          escopo: 'nada é implementado em dry-run',
        }),
      });
    }
    return Promise.resolve({ result: '(dry-run — nenhum agente rodou, nada foi mergeado)' });
  }

  return new Promise((resolve, reject) => {
    const filho = spawn('claude', args, { shell: true, cwd: process.cwd() });
    let stdout = '';
    let stderr = '';
    filho.stdout.on('data', (d) => (stdout += d));
    filho.stderr.on('data', (d) => (stderr += d));
    filho.on('error', reject);
    filho.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude saiu com ${code}: ${stderr.slice(0, 500)}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ result: stdout }); // --output-format json falhou; devolve cru
      }
    });
    filho.stdin.end(prompt);
  });
}

/** Extrai o primeiro objeto JSON de um texto — o modelo pode cercar de prosa. */
function extrairJson(texto) {
  const m = /\{[\s\S]*\}/.exec(texto ?? '');
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// ── as duas fases ────────────────────────────────────────────────────────────

const PROMPT_CLASSIFICA = (texto) => `Você é o orquestrador do fluxo multi-agente do Vetor Wallet.

Leia \`docs/multi-agent/README.md\` (roteamento de modelos), \`docs/multi-agent/CALIBRAGEM.md\` e \`docs/multi-agent/BACKLOG.md\`.

O humano escreveu no canal #new-tasks:
"""
${texto}
"""

CLASSIFIQUE apenas. NÃO implemente nada, NÃO escreva em nenhum arquivo, NÃO crie branch.

Responda APENAS com um JSON, sem cercas de código e sem texto em volta:
{"id":"T-xxx (próximo id livre)","titulo":"imperativo e curto","complexidade":"baixa|média|alta","justificativa":"por que essa complexidade, em uma frase","escopo":"o que fazer, em 2-3 frases"}`;

const PROMPT_EXECUTA = (item) => `Você é o orquestrador do fluxo multi-agente do Vetor Wallet, rodando em MODO AUTÔNOMO — o humano NÃO está na sala e não pode ser consultado.

Leia \`docs/multi-agent/README.md\` e \`CLAUDE.md\` antes de qualquer coisa e siga o loop fechado descrito lá.

Tarefa a executar:
- **ID**: ${item.classificacao.id}
- **Título**: ${item.classificacao.titulo}
- **Complexidade**: ${item.classificacao.complexidade}
- **Escopo**: ${item.classificacao.escopo}
- **Pedido original do humano**: "${item.texto}"

O que fazer, em ordem:
1. Registre a tarefa no \`docs/multi-agent/BACKLOG.md\` seguindo a regra de higiene do topo do arquivo (~700 caracteres, e rode \`pnpm backlog:check\` depois).
2. Delegue a UM subagente \`executor\` com \`isolation: "worktree"\` e o modelo do roteamento.
3. Revise o diff com um subagente \`revisor\` (Sonnet).
4. REPROVADA → devolva ao executor com o feedback. APROVADA → abra PR com \`--body-file\` e faça o merge.
5. Ao concluir, REMOVA o bloco da tarefa do \`BACKLOG.md\` (o registro fica na PR e no git) e rode \`pnpm backlog:check\`.

Se a tarefa se revelar impossível ou depender de decisão humana, PARE, registre em \`docs/multi-agent/TODO-HUMANO.md\` e explique no retorno — não invente a decisão.

Ao final, devolva um resumo CURTO (máx. 1200 caracteres) do que foi integrado: PR, arquivos tocados, testes rodados com o resultado, e o que ficou pendente.`;

async function classificar(item) {
  log(`classificando: "${item.texto.slice(0, 60)}"`);
  const saida = await rodarClaude({
    prompt: PROMPT_CLASSIFICA(item.texto),
    modelo: 'haiku',
    autonomo: false,
    texto: item.texto,
  });
  const c = extrairJson(saida.result) ?? extrairJson(JSON.stringify(saida));
  if (!c?.complexidade) throw new Error(`classificação não devolveu JSON utilizável`);
  return c;
}

async function executar(item) {
  const modelo = MODELO_POR_COMPLEXIDADE[item.classificacao.complexidade] ?? 'sonnet';
  log(`executando ${item.classificacao.id} em ${modelo}`);
  const saida = await rodarClaude({ prompt: PROMPT_EXECUTA(item), modelo, autonomo: true });
  return String(saida.result ?? '').slice(0, 1500);
}

// ── fila serial ──────────────────────────────────────────────────────────────

function enfileirar(item) {
  fila.push(item);
  void bombear();
}

async function bombear() {
  if (executando || pausado || fila.length === 0) return;
  executando = true;
  const item = fila.shift();
  try {
    if (!item.classificacao) {
      item.classificacao = await classificar(item);
      await reagir(CANAL_ENTRADA, item.messageId, '✅');

      if (item.classificacao.complexidade === 'alta') {
        // Trava 3: alta roda em Opus e nao dispara sozinha.
        const msg = await postar(
          CANAL_DECISAO,
          `**${item.classificacao.id} — ${item.classificacao.titulo}**\n\n` +
            `Classifiquei como **alta**, o que significa executor **Opus**. Pela trava de custo, não disparo sozinho.\n\n` +
            `**Por quê**: ${item.classificacao.justificativa}\n` +
            `**Escopo**: ${item.classificacao.escopo}\n\n` +
            `Seu pedido: "${item.texto}"\n\n` +
            `**Responder**: só emoji — ✅ pode executar · ❌ deixa pra lá`,
          { embed: true, title: 'Confirmação de custo', mention: true },
        );
        await reagir(CANAL_DECISAO, msg.id, '✅');
        await reagir(CANAL_DECISAO, msg.id, '❌');
        aguardandoConfirmacao.set(msg.id, item);
        log(`${item.classificacao.id} aguardando ✅ (alta)`);
        return;
      }
    }

    const resumo = await executar(item);
    await postar(
      CANAL_EXECUCAO,
      `**${item.classificacao.id} — ${item.classificacao.titulo}**\n\n${resumo}`,
      // O titulo tem que denunciar o dry-run: "Integração concluída" numa
      // simulação e mentira no canal, e o canal e o que o humano le.
      {
        embed: true,
        title: DRY_RUN ? '[DRY-RUN] simulação — nada foi executado' : 'Integração concluída',
        mention: !DRY_RUN,
      },
    );
    log(`${item.classificacao.id} concluída`);
  } catch (err) {
    log(`ERRO: ${err.message}`);
    await postar(
      CANAL_EXECUCAO,
      `Falhei em "${item.texto.slice(0, 200)}".\n\n\`\`\`\n${String(err.message).slice(0, 1200)}\n\`\`\`\n\nNada foi mergeado. A fila continua.`,
      { embed: true, title: 'Falha na execução', mention: true },
    ).catch(() => {});
  } finally {
    executando = false;
    void bombear();
  }
}

// ── eventos do Gateway ───────────────────────────────────────────────────────

async function aoReceberMensagem(d) {
  if (d.author?.id !== HUMANO || d.channel_id !== CANAL_ENTRADA) return;
  const texto = (d.content ?? '').trim();
  if (!texto) return;

  if (/^(pausar|pause)$/i.test(texto)) {
    pausado = true;
    await reagir(CANAL_ENTRADA, d.id, '⏸️');
    return log('PAUSADO pelo humano');
  }
  if (/^(retomar|resume)$/i.test(texto)) {
    pausado = false;
    await reagir(CANAL_ENTRADA, d.id, '▶️');
    log('RETOMADO pelo humano');
    return void bombear();
  }

  await reagir(CANAL_ENTRADA, d.id, '👀');
  enfileirar({ texto, messageId: d.id, classificacao: null });
  log(`enfileirado (fila: ${fila.length})`);
}

function aoReceberReacao(d) {
  if (d.user_id !== HUMANO) return;
  const item = aguardandoConfirmacao.get(d.message_id);
  if (!item) return;
  const emoji = d.emoji?.name;
  if (emoji === '✅') {
    aguardandoConfirmacao.delete(d.message_id);
    log(`${item.classificacao.id} confirmada pelo humano`);
    enfileirar(item);
  } else if (emoji === '❌') {
    aguardandoConfirmacao.delete(d.message_id);
    log(`${item.classificacao.id} recusada pelo humano`);
  }
}

// ── conexao ──────────────────────────────────────────────────────────────────

let ws;
let heartbeat;
let seq = null;
let sessionId = null;
let resumeUrl = null;
let backoff = 1000;

function conectar() {
  const url = resumeUrl ?? 'wss://gateway.discord.gg';
  ws = new WebSocket(`${url}/?v=10&encoding=json`);

  ws.addEventListener('open', () => log(`conectado (${resumeUrl ? 'resume' : 'novo'})`));

  ws.addEventListener('message', (ev) => {
    const { op, d, s, t } = JSON.parse(ev.data);
    if (s !== null && s !== undefined) seq = s;

    if (op === 10) {
      clearInterval(heartbeat);
      heartbeat = setInterval(() => ws.send(JSON.stringify({ op: 1, d: seq })), d.heartbeat_interval);
      const identify =
        sessionId && resumeUrl
          ? { op: 6, d: { token: process.env.DISCORD_BOT_TOKEN, session_id: sessionId, seq } }
          : {
              op: 2,
              d: {
                token: process.env.DISCORD_BOT_TOKEN,
                intents: INTENTS,
                properties: { os: process.platform, browser: 'vetor-daemon', device: 'vetor-daemon' },
              },
            };
      ws.send(JSON.stringify(identify));
      return;
    }

    if (op === 7 || op === 9) {
      // 7 = reconecte; 9 = sessao invalida (nao da para resumir)
      if (op === 9) {
        sessionId = null;
        resumeUrl = null;
      }
      return ws.close();
    }

    if (op !== 0) return;
    if (t === 'READY') {
      backoff = 1000;
      sessionId = d.session_id;
      resumeUrl = d.resume_gateway_url;
      return log(`pronto como ${d.user?.username} — escutando #new-tasks`);
    }
    if (t === 'MESSAGE_CREATE') void aoReceberMensagem(d);
    if (t === 'MESSAGE_REACTION_ADD') aoReceberReacao(d);
  });

  ws.addEventListener('close', (ev) => {
    clearInterval(heartbeat);
    log(`conexão caiu (${ev.code}) — reconectando em ${backoff}ms`);
    setTimeout(conectar, backoff);
    backoff = Math.min(backoff * 2, 60_000);
  });

  ws.addEventListener('error', () => {}); // o close cuida da reconexao
}

log(DRY_RUN ? 'iniciando em DRY-RUN (nada é executado)' : 'iniciando');
conectar();
