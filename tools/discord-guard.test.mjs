// Testes do discord-guard.mjs. Mesmo padrao do backlog-guard: sobrescreve os
// caminhos por argv para nao depender do estado real do repo. Diferente do
// backlog-guard, este guard tambem depende de `git log`, entao cada teste cria
// um repositorio git temporario proprio (mkdtemp) com commits em datas
// controladas via GIT_AUTHOR_DATE/GIT_COMMITTER_DATE — assim a ordem
// "espelho antes/depois do commit" fica determinística, sem depender do
// relógio da máquina que roda o teste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = fileURLToPath(new URL('./discord-guard.mjs', import.meta.url));
const BACKLOG = 'BACKLOG.md';
const TODO_HUMANO = 'TODO-HUMANO.md';
const STATE = 'discord-state.json';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'discord-guard-test-'));
  run(dir, ['init', '--quiet']);
  run(dir, ['config', 'user.email', 'test@example.com']);
  run(dir, ['config', 'user.name', 'Test']);
  return dir;
}

function run(dir, args, env) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
}

function commit(dir, file, content, { date }) {
  writeFileSync(join(dir, file), content, 'utf8');
  run(dir, ['add', file]);
  run(dir, ['commit', '-m', 'msg', '--quiet'], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  });
}

function writeState(dir, state) {
  writeFileSync(join(dir, STATE), JSON.stringify(state, null, 2), 'utf8');
}

function runGuard(dir, toleranceMs) {
  const args = [GUARD, STATE, BACKLOG, TODO_HUMANO];
  if (toleranceMs !== undefined) args.push(String(toleranceMs));
  const result = spawnSync('node', args, { cwd: dir, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const T0 = '2026-01-01T00:00:00-03:00'; // commit inicial estrutural
const MIRROR_AFTER_T0 = '2026-01-02T00:00:00-03:00'; // espelho sincronizado depois do T0
const T2_PROSE = '2026-01-03T00:00:00-03:00'; // edicao de prosa apos o espelho
const T2_STRUCT = '2026-01-04T00:00:00-03:00'; // mudanca estrutural apos o espelho

test('espelho em dia (commit antes do timestamp do espelho) -> passa', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeState(dir, {
      backlog: { atualizadoEm: MIRROR_AFTER_T0 },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    const result = runGuard(dir);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /ok/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BACKLOG.md com mudanca estrutural apos o espelho -> reprova com mensagem acionavel', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeState(dir, {
      backlog: { atualizadoEm: MIRROR_AFTER_T0 },
      todoHumano: { atualizadoEm: T2_STRUCT },
    });

    // Tarefa nova adicionada DEPOIS do espelho ter sido marcado como em dia.
    commit(
      dir,
      BACKLOG,
      '### T-001 — algo\n- **Status**: PENDENTE\n\n### T-002 — nova\n- **Status**: PENDENTE\n',
      { date: T2_STRUCT },
    );

    const result = runGuard(dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /BACKLOG\.md/);
    assert.match(result.stderr, /espelho "backlog"/);
    assert.match(result.stderr, /atualize/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('edicao so de prosa (nao estrutural) apos o espelho -> passa de proposito', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n- nota: rascunho\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeState(dir, {
      backlog: { atualizadoEm: MIRROR_AFTER_T0 },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    // Corrige um acento na nota; nenhum cabecalho de tarefa nem Status muda.
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n- nota: rascunho revisado\n', {
      date: T2_PROSE,
    });

    const result = runGuard(dir);
    assert.equal(result.code, 0, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TODO-HUMANO.md com resposta nova registrada apos o espelho -> reprova', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeState(dir, {
      backlog: { atualizadoEm: MIRROR_AFTER_T0 },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    commit(
      dir,
      TODO_HUMANO,
      '### [2026-01-01] pendencia\n- **Resposta do humano**: aprovado, seguir.\n',
      { date: T2_STRUCT },
    );

    const result = runGuard(dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /TODO-HUMANO\.md/);
    assert.match(result.stderr, /espelho "todoHumano"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('entrada ausente no discord-state.json -> reprova (nunca foi espelhado)', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    // Sem a chave "backlog" nem "todoHumano".
    writeState(dir, { docsApp: { atualizadoEm: MIRROR_AFTER_T0 } });

    const result = runGuard(dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /ausente/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('discord-state.json malformado -> falha explicita, nao silenciosa', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeFileSync(join(dir, STATE), '{ nao é json valido ][', 'utf8');

    const result = runGuard(dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /JSON/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fallback de data-only: mirror so com "YYYY-MM-DD" no mesmo dia do commit -> passa (falso negativo aceito)', () => {
  const dir = makeRepo();
  try {
    // Mirror registrado como so-data no MESMO dia calendario do commit estrutural,
    // mesmo que o instante exato do commit seja "depois" das 00:00 daquele dia.
    // Decisao documentada no cabecalho do guard: instante mais generoso (23:59:59.999)
    // evita reprovar entradas legadas so-com-data.
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', {
      date: '2026-01-01T10:00:00-03:00',
    });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeState(dir, {
      backlog: { atualizadoEm: '2026-01-01' },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    const result = runGuard(dir);
    assert.equal(result.code, 0, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fallback de data-only: mirror so com "YYYY-MM-DD" de um dia ANTERIOR ao commit estrutural -> reprova', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeState(dir, {
      backlog: { atualizadoEm: MIRROR_AFTER_T0 },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    commit(
      dir,
      BACKLOG,
      '### T-001 — algo\n- **Status**: PENDENTE\n\n### T-003 — outra nova\n- **Status**: PENDENTE\n',
      { date: '2026-01-10T09:00:00-03:00' },
    );
    // Espelho so tem data (sem hora) de um dia bem anterior ao commit acima.
    writeState(dir, {
      backlog: { atualizadoEm: '2026-01-02' },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    const result = runGuard(dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /BACKLOG\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('git log sem historico para o caminho (checkout raso/simulado) -> degrada com aviso, nao reprova', () => {
  const dir = makeRepo();
  try {
    // Commit inicial normal, mas o arquivo TODO_HUMANO nunca foi commitado —
    // simula `git log` sem nenhum resultado para aquele caminho (o mesmo efeito
    // pratico de um checkout raso que nao alcanca o commit que tocou o arquivo).
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    writeFileSync(join(dir, TODO_HUMANO), '### [2026-01-01] pendencia sem commit\n', 'utf8');
    writeState(dir, {
      backlog: { atualizadoEm: MIRROR_AFTER_T0 },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    const result = runGuard(dir);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /sem historico dispon[ií]vel/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tolerancia: commit estrutural poucos segundos depois do espelho -> passa (folga da corrida do fluxo)', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeState(dir, {
      backlog: { atualizadoEm: MIRROR_AFTER_T0 },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    // Mensagem editada no Discord, JSON escrito e o commit fecha 30s depois —
    // exatamente a ordem natural do fluxo em 3 passos, sem drift real nenhum.
    const commitDate = new Date(new Date(MIRROR_AFTER_T0).getTime() + 30_000).toISOString();
    commit(
      dir,
      BACKLOG,
      '### T-001 — algo\n- **Status**: PENDENTE\n\n### T-004 — nova\n- **Status**: PENDENTE\n',
      { date: commitDate },
    );

    const result = runGuard(dir); // folga default (5 min) do proprio guard
    assert.equal(result.code, 0, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tolerancia: commit estrutural bem depois da folga -> reprova mesmo com timestamp ISO completo', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeState(dir, {
      backlog: { atualizadoEm: MIRROR_AFTER_T0 },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    // 10 minutos depois do espelho — acima da folga default de 5 minutos.
    const commitDate = new Date(new Date(MIRROR_AFTER_T0).getTime() + 10 * 60_000).toISOString();
    commit(
      dir,
      BACKLOG,
      '### T-001 — algo\n- **Status**: PENDENTE\n\n### T-005 — nova\n- **Status**: PENDENTE\n',
      { date: commitDate },
    );

    const result = runGuard(dir); // folga default (5 min)
    assert.equal(result.code, 1);
    assert.match(result.stderr, /BACKLOG\.md/);
    assert.match(result.stderr, /folga/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('folga customizada por argv (so para teste): 0ms reprova o que a folga default deixaria passar', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-001 — algo\n- **Status**: PENDENTE\n', { date: T0 });
    commit(dir, TODO_HUMANO, '### [2026-01-01] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: T0,
    });
    writeState(dir, {
      backlog: { atualizadoEm: MIRROR_AFTER_T0 },
      todoHumano: { atualizadoEm: MIRROR_AFTER_T0 },
    });

    const commitDate = new Date(new Date(MIRROR_AFTER_T0).getTime() + 30_000).toISOString();
    commit(
      dir,
      BACKLOG,
      '### T-001 — algo\n- **Status**: PENDENTE\n\n### T-006 — nova\n- **Status**: PENDENTE\n',
      { date: commitDate },
    );

    const withDefaultTolerance = runGuard(dir);
    assert.equal(withDefaultTolerance.code, 0, withDefaultTolerance.stderr);

    const withZeroTolerance = runGuard(dir, 0);
    assert.equal(withZeroTolerance.code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Reproduz o cenario medido pelo revisor contra a `main` real: o commit
// c757ea3 mudou **Status** da T-089 no BACKLOG.md em 2026-08-12T20:26:20-03:00,
// horas depois do espelho ter sido marcado como em dia no mesmo dia — com o
// bug do fallback so-com-data ("YYYY-MM-DD"), isso passava (o dia bate). Com
// o espelho migrado para ISO completo (a correcao desta rodada), o guard
// agora reprova corretamente.
test('cenario real do commit c757ea3: espelho ISO completo mais antigo no mesmo dia -> reprova (nao engole mais)', () => {
  const dir = makeRepo();
  try {
    commit(dir, BACKLOG, '### T-089 — Conectar a Pluggy\n- **Status**: PENDENTE\n', {
      date: '2026-08-12T09:00:00-03:00',
    });
    commit(dir, TODO_HUMANO, '### [2026-08-12] pendencia\n- **Resposta do humano**: _(preencher)_\n', {
      date: '2026-08-12T09:00:00-03:00',
    });
    // Espelho sincronizado de manha, ISO completo (nao mais "2026-08-12" so-data).
    writeState(dir, {
      backlog: { atualizadoEm: '2026-08-12T10:00:00-03:00' },
      todoHumano: { atualizadoEm: '2026-08-12T10:00:00-03:00' },
    });

    // Status muda a noite, horas depois do espelho — mesmo dia calendario.
    commit(dir, BACKLOG, '### T-089 — Conectar a Pluggy\n- **Status**: EM_ANDAMENTO\n', {
      date: '2026-08-12T20:26:20-03:00',
    });

    const result = runGuard(dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /BACKLOG\.md/);
    assert.match(result.stderr, /espelho "backlog"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
