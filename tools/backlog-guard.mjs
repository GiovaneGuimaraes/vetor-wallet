#!/usr/bin/env node
// Guarda de higiene do BACKLOG.md. A regra "tarefa concluida sai do backlog" ja
// existia em prosa no README e foi ignorada por 20 ciclos ate o arquivo chegar a
// 78 KB (77% de tarefas concluidas). Regra que depende de alguem lembrar ja falhou.
//
// Uso: pnpm backlog:check

import { readFileSync } from 'node:fs';

// Caminho sobrescrevivel pelo argv so para o proprio teste do guard.
const FILE = process.argv[2] ?? 'docs/multi-agent/BACKLOG.md';
const MAX_BYTES = 8 * 1024;

const raw = readFileSync(FILE, 'utf8');
const problems = [];

const bytes = Buffer.byteLength(raw, 'utf8');
if (bytes > MAX_BYTES) {
  problems.push(
    `${FILE} tem ${bytes} bytes (teto ${MAX_BYTES}). ` +
      `Provavel causa: tarefa concluida que nao saiu, ou spec inflada. ` +
      `Tarefa viva cabe em ~700 caracteres.`,
  );
}

// Titulo de tarefa e a linha "### T-xxx"; o status vem nas linhas seguintes, ate
// o proximo titulo. O bloco "Modelo de tarefa" usa T-000 e fica de fora.
// Filtra pelo formato do bloco em vez de descartar o primeiro: um arquivo que
// comeca direto num cabecalho nao tem preambulo para descartar.
for (const bloco of raw.split(/\n(?=### T-)/)) {
  const id = /^### (T-[\w]+)/.exec(bloco)?.[1];
  if (!id || id === 'T-000') continue;
  if (/\*\*Status\*\*:?\s*CONCLUIDA/.test(bloco)) {
    problems.push(
      `${id} esta CONCLUIDA e ainda ocupa o backlog. ` +
        `O registro do que foi feito vive na PR e no git — remova o bloco daqui.`,
    );
  }
}

if (problems.length) {
  process.stderr.write(`\nbacklog-guard reprovou ${FILE}:\n`);
  for (const p of problems) process.stderr.write(`  - ${p}\n`);
  process.stderr.write('\nRegras em docs/multi-agent/BACKLOG.md § Higiene.\n\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`backlog-guard ok — ${bytes}/${MAX_BYTES} bytes, nenhuma tarefa concluída.\n`);
}
