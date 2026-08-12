#!/usr/bin/env node
// Guarda do espelho do Discord. A regra "espelhar e parte de concluir" nasceu em
// prosa no README (secao "Interface no Discord", regra dura de 2026-08-12) e
// falhou no MESMO DIA em que foi escrita — mesma historia do teto do
// BACKLOG.md, que so passou a valer quando virou script no CI (ver o cabecalho
// de backlog-guard.mjs: "regra que depende de alguem lembrar ja falhou").
//
// O que ele checa: o ultimo commit que tocou BACKLOG.md ou TODO-HUMANO.md ficou
// MAIS NOVO que o espelho correspondente registrado em discord-state.json? Se
// sim, o humano esta lendo no Discord uma fila que nao bate com o repo.
//
// Sem rede, sem token: so compara metadados do `git log` com o JSON. Roda no
// CI, que nao tem (e nao deve ter) credencial do bot.
//
// Mapeamento arquivo -> espelho:
//   - BACKLOG.md      -> state.backlog.atualizadoEm      (mensagem-embed unica)
//   - TODO-HUMANO.md  -> state.todoHumano.atualizadoEm    (marcador novo: "todas
//     as pendencias deste arquivo estao refletidas no #todo-human/#todo-ai a
//     partir deste instante". Nao existe uma unica mensagem-espelho do arquivo
//     inteiro — cada pendencia tem a sua, em `humanTodos` — mas o guard nao
//     tem como (nem deve, sem rede) inspecionar mensagem por mensagem. Um
//     timestamp agregado e o contrato minimo que ainda deixa o guard binario.
//
// Granularidade do timestamp: `atualizadoEm` deveria ser ISO 8601 completo
// (data+hora). Entradas antigas do discord-state.json so tem "YYYY-MM-DD" —
// dois commits no mesmo dia, um antes e um depois do espelho, ficam
// indistinguiveis nessa granularidade. Resolvido com FALSO NEGATIVO de
// proposito (deixa passar), nunca falso positivo: uma data sem hora e tratada
// como "23:59:59.999 desse dia" (o instante mais generoso possivel), entao o
// guard so reprova quando o commit e de um dia estritamente posterior. Isso
// deixa passar, de proposito, o caso "commitei e espelhei no mesmo dia, so que
// a ordem exata das duas coisas ficou por hora nao registrada" — o preco de
// nao travar CI por uma tarefa que so mudou uma virgula no mesmo dia do
// espelho. Entradas novas devem usar ISO completo (`...T14:30:00-03:00`) para
// fugir dessa zona cinza.
//
// O que conta como "mexeu" (evita falso positivo travando CI por typo):
// so reprova se, entre o timestamp do espelho e agora, houve pelo menos um
// commit cujo diff no arquivo alterou uma linha ESTRUTURAL — cabecalho de
// tarefa/pendencia ou campo de status/decisao — não qualquer diff. Corrigir
// um acento ou reordenar uma frase no meio de um bloco nao dispara o guard.
// Isso deixa passar, de proposito, edicao de prosa que nao muda o que o
// espelho promete mostrar.
//
// Uso: pnpm discord:check
// Overrides (so para o teste deste guard): argv[2]=discord-state.json,
// argv[3]=BACKLOG.md, argv[4]=TODO-HUMANO.md. `git` roda sempre a partir do
// cwd do processo — o teste troca o cwd, nao os caminhos.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const STATE_FILE = process.argv[2] ?? 'docs/multi-agent/discord-state.json';
const BACKLOG_FILE = process.argv[3] ?? 'docs/multi-agent/BACKLOG.md';
const TODO_HUMANO_FILE = process.argv[4] ?? 'docs/multi-agent/TODO-HUMANO.md';

// Linha ADICIONADA ou REMOVIDA que conta como mudanca estrutural (nao prosa).
const STRUCTURAL_PATTERNS = {
  [BACKLOG_FILE]: [/^[+-]\s*#{2,4}\s*T-\w+/, /^[+-].*\*\*Status\*\*/],
  [TODO_HUMANO_FILE]: [/^[+-]\s*#{2,4}\s*\[/, /^[+-].*\*\*Resposta do humano\*\*/],
};

const MIRROR_KEY_BY_FILE = {
  [BACKLOG_FILE]: 'backlog',
  [TODO_HUMANO_FILE]: 'todoHumano',
};

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch (err) {
    return { error: err };
  }
}

/** Data-only ("YYYY-MM-DD") vira o instante mais generoso desse dia: 23:59:59.999. */
function mirrorInstant(atualizadoEm) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(atualizadoEm)) {
    return new Date(`${atualizadoEm}T23:59:59.999Z`);
  }
  const d = new Date(atualizadoEm);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function lastCommitIso(file) {
  const out = git(['log', '-1', '--format=%cI', '--', file]);
  if (typeof out !== 'string' || out === '') return null;
  return out;
}

function hasStructuralChangeSince(file, sinceIso, patterns) {
  const hashesOut = git(['log', `--since=${sinceIso}`, '--format=%H', '--', file]);
  if (typeof hashesOut !== 'string' || hashesOut === '') return false;
  const hashes = hashesOut.split('\n').filter(Boolean);
  for (const hash of hashes) {
    const diff = git(['show', '--format=', hash, '--', file]);
    if (typeof diff !== 'string') continue;
    for (const line of diff.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (patterns.some((re) => re.test(line))) return true;
    }
  }
  return false;
}

function isShallow() {
  const out = git(['rev-parse', '--is-shallow-repository']);
  return out === 'true';
}

let state;
try {
  state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
} catch (err) {
  process.stderr.write(
    `\ndiscord-guard: ${STATE_FILE} nao e JSON valido — ${err.message}\n` +
      `Corrija o arquivo antes de confiar em qualquer espelho.\n\n`,
  );
  process.exitCode = 1;
  process.exit();
}

const problems = [];
const warnings = [];

if (isShallow()) {
  warnings.push(
    `repositorio com checkout raso (fetch-depth < historico completo) — se o guard ` +
      `nao achar o commit certo para algum arquivo, e por isso; ver .github/workflows/ci.yml.`,
  );
}

for (const file of [BACKLOG_FILE, TODO_HUMANO_FILE]) {
  const mirrorKey = MIRROR_KEY_BY_FILE[file];
  const commitIso = lastCommitIso(file);

  if (commitIso === null) {
    warnings.push(
      `${file}: \`git log\` nao devolveu nenhum commit para este caminho — sem historico ` +
        `disponivel (checkout raso ou arquivo nao versionado ainda), degradando sem reprovar.`,
    );
    continue;
  }

  const mirror = state[mirrorKey];
  if (!mirror || typeof mirror.atualizadoEm !== 'string') {
    problems.push(
      `${file}: nao existe espelho registrado em ${STATE_FILE} (chave "${mirrorKey}" ` +
        `ausente ou sem "atualizadoEm"). Sem espelho, o humano nunca viu esse conteudo no ` +
        `Discord — registre "${mirrorKey}.atualizadoEm" apos postar/editar a mensagem.`,
    );
    continue;
  }

  const mirrorAt = mirrorInstant(mirror.atualizadoEm);
  if (mirrorAt === null) {
    problems.push(
      `${file}: "${mirrorKey}.atualizadoEm" em ${STATE_FILE} ("${mirror.atualizadoEm}") ` +
        `nao e uma data/timestamp valido.`,
    );
    continue;
  }

  const commitAt = new Date(commitIso);
  if (commitAt <= mirrorAt) continue; // espelho em dia (ou mais novo) — ok.

  if (!hasStructuralChangeSince(file, mirror.atualizadoEm, STRUCTURAL_PATTERNS[file])) {
    // Arquivo tem commit mais novo, mas nenhum deles alterou bloco de tarefa/
    // pendencia ou status/decisao — provavel typo/prosa. Passa de proposito.
    continue;
  }

  problems.push(
    `${file}: commit mais novo (${commitIso}) que o espelho "${mirrorKey}" ` +
      `(${mirror.atualizadoEm}), com mudanca estrutural (tarefa/pendencia ou status ` +
      `adicionado/alterado). Edite a mensagem correspondente no Discord e atualize ` +
      `"${mirrorKey}.atualizadoEm" em ${STATE_FILE} antes de reportar a tarefa como concluida.`,
  );
}

if (warnings.length) {
  process.stderr.write(`\ndiscord-guard — avisos (nao reprovam):\n`);
  for (const w of warnings) process.stderr.write(`  - ${w}\n`);
}

if (problems.length) {
  process.stderr.write(`\ndiscord-guard reprovou:\n`);
  for (const p of problems) process.stderr.write(`  - ${p}\n`);
  process.stderr.write('\nRegra em docs/multi-agent/README.md § "Interface no Discord".\n\n');
  process.exitCode = 1;
} else {
  process.stdout.write('discord-guard ok — espelho do Discord em dia com BACKLOG.md e TODO-HUMANO.md.\n');
}
