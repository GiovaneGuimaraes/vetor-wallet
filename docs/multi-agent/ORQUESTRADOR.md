# Guia do orquestrador (Fable)

Leitura inicial obrigatória da sessão orquestradora. Objetivo: em ~2 minutos de leitura, entender o que é o app, onde ele está e o que importa agora.

## O que é o Vetor Wallet

Carteira pessoal de ações da B3 para um único usuário real (Giovane). O usuário cadastra operações de compra/venda; o servidor consolida posições por preço médio ponderado e busca cotações em tempo real na brapi.dev. O dashboard mostra investido, valor atual e P&L.

- **Arquitetura, schema, rotas, comandos e convenções**: leia `CLAUDE.md` na raiz — é a fonte de verdade técnica. Não duplique aquele conteúdo aqui.
- **Monorepo pnpm**: `shared` (tipos), `server` (Express + libsql), `web` (Vite + React), `cli` (job de insights horários).
- **Testes**: Vitest configurado apenas no `server`. O `web` ainda não tem runner (issue #6) — lógica testável deve virar função pura.

## Estado atual e dívidas conhecidas

Do `CLAUDE.md > Pontos de atenção`:

1. **SELL sem validação de saldo** — `portfolio.ts` trunca com `Math.max(0, newQty)` em vez de rejeitar venda maior que a posição.
2. **Cotações falham silenciosamente** — `fetchQuotes` retorna `Map` vazio em erro; UI mostra `null` sem avisar o usuário.
3. **Sessões em MemoryStore** — perdidas a cada restart do server; ok local, inviável em produção.
4. **Job horário sem agendador** — CLI `insights:hourly` roda manualmente até o deploy em Lambda + EventBridge.
5. **Web sem test runner** — issue #6.

## Prioridades (ordem atual)

> **Estado em 2026-07-24 (encerramento do ciclo 3)**: ciclos 2 (app v4 multi-layer, PRs #47–#56) e 3 (robustez, PRs #57–#60) concluídos e mergeados. Suíte: server 132 testes + web 13 testes (runner novo, issue #6 fechável). Próximo ciclo começa pela **"Fila do ciclo 4" no `BACKLOG.md`** (T-019 corretude do SELL em CSV multi-carteira; T-016 P&L diário; T-020/T-021 dependem de decisão do humano — ver `TODO-HUMANO.md`).

> Atualize esta lista com aprovação do humano quando o contexto mudar. Registre a mudança no `TODO-HUMANO.md` se precisar de decisão.

0. **[CONCLUÍDA em 2026-07-24 — PRs #47–#56 mergeadas] Refactor "Vetor Wallet v4" multi-layer**
   Elevar o app para carteira financeira completa em layers — Renda mensal, Despesas
   fixas, Poupança/Reserva, Metas, Criptomoedas (mock) e Ações — com o design do
   handoff `design_handoff_vetor_wallet_refactor/` (estilo biip.club, light/dark,
   Geist, mascotes por layer). Decomposto nas tarefas **T-003 a T-013** do
   `BACKLOG.md` (ciclo 2). Esta prioridade **substitui** a antiga prioridade 1
   (paleta 60-30-10 areia — encerrada no ciclo 1) e **remove os gráficos** do
   dashboard, o que torna a antiga prioridade 2 (métricas nos gráficos) obsoleta
   salvo decisão contrária do humano. Atenção: o handoff afirma que os modelos de
   renda/despesas/poupança/metas já existem no server — não existem; T-006/T-007
   criam esse backend.

1. **[ENCERRADA no ciclo 1] Redesign visual com regra 60-30-10 + responsividade mobile**
   Reformular o tema do app aplicando a regra 60-30-10 de cores: ~60% cor dominante
   (fundos/superfícies), ~30% cor secundária (cards, painéis, navegação), ~10% cor de
   destaque (CTAs, links, realces). O orquestrador escolhe a paleta que melhor serve o
   app (proposta atual é tom areia `#e3d5b8` — avaliar se mantém como base) e registra
   a proposta no `TODO-HUMANO.md` para aprovação antes de aplicar em larga escala.
   Restrições: implementar via CSS custom properties em `web/src/index.css` (convenção
   do projeto); preservar as cores semânticas de lucro/prejuízo (verde/vermelho) fora
   da conta do 60-30-10; nada de framework CSS novo sem aprovação.
   Inclui responsividade mobile: todas as telas (dashboard, operações, auth, admin)
   usáveis em viewport ≥360px — tabelas viram scroll horizontal ou layout empilhado,
   formulários em coluna única, gráficos redimensionam.
   Critério de aceite: telas legíveis e operáveis em 360px, 768px e desktop sem
   overflow horizontal da página; paleta documentada (qual cor é 60, qual é 30, qual
   é 10) em comentário no `index.css`.

2. **Métricas reais nos gráficos das carteiras**
   Os gráficos em `web/src/components/PortfolioDashboard.tsx` (gráfico de evolução de
   patrimônio com nós `<circle>` e os sparklines por posição) devem exibir valores
   reais em cada nó/ponto: valor em R$ formatado pt-BR visível no hover (tooltip) e,
   onde couber, rótulo no próprio ponto. Cada ponto deve ser condizente com a
   realidade — derivado dos dados reais de `quote_snapshots`/`hourly_quote_insights`
   e das operações do usuário, nunca interpolado/inventado; dias sem dado não geram nó.
   Investigar antes de corrigir: de onde vem cada série hoje e onde ela diverge do
   valor real da carteira (ex.: snapshot ausente, cotação nula tratada como zero).
   Critério de aceite: para uma carteira de teste com operações conhecidas, o valor de
   cada nó bate com o cálculo manual (quantidade × preço do snapshot do dia); lógica de
   montagem das séries extraída para função pura com teste automatizado.

3. **Ampliar funcionalidades do /admin**
   Hoje o admin (`web/src/components/AdminPage.tsx` + `server/src/routes/admin.ts`) só
   dispara o job de insights horários. Ampliar para um painel de operação do app.
   Candidatas (orquestrador propõe o conjunto final no `TODO-HUMANO.md` antes de
   implementar): listagem de usuários com contagem de operações/carteiras; status dos
   dados (últimos snapshots por ticker, buracos de cobertura, falhas de captura);
   disparo manual do job de snapshots diários com feedback de resultado; visão dos
   alertas ativos de todos os usuários; healthcheck da integração brapi (última
   resposta, latência, uso de token).
   Restrições: toda rota nova exige `requireAuth` + `requireAdmin` e teste automatizado
   (padrão existente em `admin.test.ts`); nenhuma rota admin expõe hash de senha.
   Critério de aceite: cada funcionalidade nova acessível pela AdminPage, negada com
   403 para usuário não-admin, e coberta por teste de rota.

4. **Logo oficial nas páginas**
   O arquivo `logo-vetor-wallet.png` está salvo no repositório e deve virar a
   identidade visual do app: exibir a logo junto à string "Vetor Wallet" no cabeçalho
   das páginas autenticadas (`App.tsx`) e na tela de login/registro (`AuthPage.tsx`),
   além de usá-la como favicon (gerar tamanho adequado a partir do PNG).
   Primeiro passo do executor: localizar o arquivo no repo (`git ls-files | grep -i logo`)
   e movê-lo para `web/public/` se ainda não estiver lá.
   Restrições: imagem servida como asset estático do Vite (`web/public/`); manter
   proporção sem distorção; dimensionar bem em mobile (coordenar com a prioridade 1 —
   pode ser executada junto do redesign).
   Critério de aceite: logo visível no header e na tela de auth em desktop e mobile,
   favicon atualizado, build do web (`pnpm --filter vetor-wallet-web build`) sem erro.

## Como operar

1. Leia `README.md` (fluxo), este arquivo, `CLAUDE.md` e o `BACKLOG.md` atual.
2. Decomponha a prioridade vigente em tarefas de **até ~1h de trabalho de um executor**, cada uma com critério de aceite verificável, e registre no `BACKLOG.md`.
3. Delegue com a ferramenta Agent, subagente `executor`, `isolation: "worktree"`, uma tarefa por agente. Paralelize apenas tarefas independentes.
4. No prompt de cada executor inclua: o item do backlog na íntegra, os arquivos-alvo prováveis, e a instrução de ler `docs/multi-agent/README.md` e `CLAUDE.md` antes de codar.
5. Ao receber o retorno, spawn do `revisor` sobre o diff. Reprovado → devolve ao executor com o feedback. Aprovado → atualize o `BACKLOG.md`.
6. Consolide e reporte ao humano: o que fechou, o que bloqueou, o que entrou no `TODO-HUMANO.md`. Merge e PR só com aprovação humana.
7. Reavalie prioridades e recomece.

## Limites do orquestrador

- Não implementa tarefas grandes diretamente — decompõe e delega. Correções triviais (typo, ajuste de doc) pode fazer inline.
- Não decide produto: mudanças de escopo, UX ou prioridade vão para o `TODO-HUMANO.md`.
- Merge e PR: **autorização permanente concedida pelo humano em 2026-07-24** — após veredito APROVADA do revisor, o orquestrador abre a PR e faz o merge automático, resolvendo conflitos (revisão humana a posteriori sobre as PRs). Perguntas puramente operacionais de integração não bloqueiam o loop; decisões de produto/UX continuam indo ao `TODO-HUMANO.md`.
