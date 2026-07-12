# Handoff: Refactor do front do Vetor Wallet (multi-carteiras + tema claro/escuro)

## Overview
Refactor visual e funcional do Vetor Wallet (repo `GiovaneGuimaraes/vetor-wallet`, monorepo pnpm: `web/` Vite + React + TS + Tailwind v4, `server/` Express + SQLite, `shared/` tipos). O design cobre o fluxo completo:

**Login → Seleção de carteiras (nova tela) → Dashboard (layout "visão geral")**

Novidades em relação ao app atual: suporte a múltiplas carteiras por usuário, tela de seleção com cards em formato de cartão de crédito, nova paleta champanhe/bronze sobre grafite quente (substituindo o azul), light mode com toggle por ícone, e interatividade rica (contadores animados, gráficos SVG, linhas expansíveis).

## About the Design Files
Os arquivos `.dc.html` neste pacote são **referências de design criadas em HTML** — protótipos que mostram o visual e o comportamento pretendidos, NÃO código de produção para copiar. A tarefa é **recriar estes designs no codebase existente** (`web/` com React + TS + Tailwind v4, seguindo os padrões atuais de `components/`, `api.ts` e tokens `@theme` em `index.css`). O arquivo principal de referência é `Vetor Wallet v3.dc.html`.

## Fidelity
**High-fidelity (hifi).** Cores, tipografia, espaçamentos, raios, sombras e animações são finais. Recriar pixel-perfect usando os padrões do codebase. A base visual deriva dos componentes reais do repo (AuthPage, OperationForm, PortfolioDashboard, etc.) — a estrutura de componentes existente deve ser mantida e evoluída, não reescrita do zero.

## Design Tokens

Implementar como CSS variables com classe `.light` no `<html>`, persistida em `localStorage['vw-theme']`, e `color-scheme` correspondente. Atualizar o `@theme` do Tailwind para apontar para as variables.

### Dark (padrão)
| Token | Valor | Uso |
|---|---|---|
| canvas | `#0f0e0b` | fundo da página |
| card-1 / card-2 | `#1a1712` / `#12100c` | cards `linear-gradient(180deg, card-1, card-2)` |
| raised | `#211d16` | superfícies elevadas, trilha de barras |
| raised-rgb | `33,29,22` | hovers `rgba(raised, .55–.7)` |
| edge | `#2b261d` | bordas |
| edge-rgb | `43,38,29` | bordas suaves `rgba(edge, .35–.5)` |
| ink | `#ece5d6` | texto principal |
| dim | `#7d7364` | texto secundário/labels |
| mid | `#b3a892` | texto intermediário |
| accent | `#e3d5b8` | champanhe — links, focos, destaques |
| accent-2 | `#e9dcc0` | hover de links, texto accent |
| accent-rgb | `227,213,184` | tintas/glow `rgba(accent, .1–.55)` |
| btn-1 / btn-2 | `#f2e7cd` / `#d9c49c` | botão primário `linear-gradient(135deg)`, texto `#1a1610` |
| header-bg | `rgba(15,14,11,.8)` | header sticky com `backdrop-filter: blur(8px)` |
| leather-1 | `#242019` | topo do gradiente dos cards-cartão |

### Light
| Token | Valor |
|---|---|
| canvas `#f4efe5` · card-1 `#fffdf8` · card-2 `#faf5ea` · raised `#ece5d5` (rgb `214,204,184`) |
| edge `#e0d8c5` (rgb `150,138,114`) · ink `#2b251a` · dim `#9a9080` · mid `#6b6250` |
| accent `#a8814f` (bronze, rgb `168,129,79`) · accent-2 `#8a6a3f` |
| btn-1 `#b99668` · btn-2 `#a37f4e` · texto do botão `#fff` |
| header-bg `rgba(246,241,231,.85)` · leather-1 `#f1e9d8` |

### Inalterados nos dois temas
up `#10b981` · down `#f43f5e` · warn `#f59e0b`

### Tipografia e formas
- Fonte: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`, antialiased
- Labels: 11px, weight 600, uppercase, `letter-spacing: .08em`, cor dim
- Corpo/tabelas: 13–14px · Títulos de card: 14px weight 600
- Números: `font-variant-numeric: tabular-nums`; valores grandes 26–30px weight 600–650, `letter-spacing: -.01em`
- Radius: inputs/botões 10px · cards 16px · cards-cartão 20px · chips 99px
- Inputs: fundo canvas, borda edge; focus = borda accent + `box-shadow: 0 0 0 3px rgba(accent-rgb,.18)`
- Botão primário: gradiente btn-1→btn-2; hover `translateY(-1px)` + `box-shadow: 0 6px 24px rgba(accent-rgb,.4)`
- Botão fantasma: fundo `rgba(raised,.6)`, borda edge; hover borda/texto accent

## Screens / Views

### 1. Login
- **Purpose**: autenticação (rotas já existem: `/api/auth/login`, `/register`, `/me`).
- **Layout**: coluna centrada vertical/horizontal, largura máx. 380px, fundo canvas + `radial-gradient(90% 60% at 50% -10%, rgba(accent-rgb,.12), transparent 60%)`.
- **Components**:
  - Wordmark "Vetor Wallet" 26px com gradiente de texto accent; subtítulo "Carteira B3 pessoal" 14px dim.
  - Card (padding 26px, sombra `0 24px 80px rgba(0,0,0,.45)`) com segmented control "Entrar / Criar conta" (aba ativa = gradiente do botão primário), campos E-mail e Senha (+ Confirmar senha no modo registro, placeholder "Mínimo 8 caracteres"), botão primário full-width.
  - Rodapé: "Suas cotações via brapi.dev · dados criptografados" (12px dim) e o toggle de tema (ícone).

### 2. Suas carteiras (NOVA)
- **Purpose**: usuário escolhe qual carteira gerir. Requer backend multi-carteira (ver State Management).
- **Layout**: header sticky (60px: wordmark à esquerda; toggle de tema, e-mail e "Sair" à direita) + título "Suas carteiras" 26px / subtítulo dim; grid `repeat(auto-fit, minmax(280px, 1fr))`, gap 18px.
- **Card-cartão (componente principal)**:
  - `aspect-ratio: 1.6`, radius 20px, padding 22px, borda edge, `background: linear-gradient(145deg, leather-1, card-2)` + tinta radial na cor da carteira `radial-gradient(130% 160% at 85% -30%, rgba(cor,.13), transparent 55%)`.
  - Brilho diagonal: overlay `linear-gradient(115deg, transparent 32%, rgba(255,255,255,.07) 46%, transparent 58%)`.
  - Topo: nome (16px weight 600) + descrição (12px dim) à esquerda; ícone de carteira (SVG stroke na cor da carteira) à direita.
  - Chip metálico: 42×31px, radius 7px, gradiente btn-1→btn-2, `inset box-shadow` + retângulo interno com borda `rgba(0,0,0,.28)` (contatos do chip). Posição: `margin-top: auto` (empurra o bloco de valor pra baixo).
  - Valor total: 30px weight 650, `text-shadow: 0 1px 0 rgba(255,255,255,.05), 0 2px 8px rgba(0,0,0,.25)` (efeito estampado).
  - Linha inferior: chip de resultado `+4,34%` (pill, fundo `rgba(up,.14)` verde ou `rgba(down,.14)` vermelho) + "N ativos · N operações" (12px mid).
  - Faixa de alocação: barra de 5px colada na borda inferior, segmentos proporcionais à alocação de cada ativo (paleta: accent, `#10b981`, `#f59e0b`, `#8b5cf6`, `#f43f5e`, `#06b6d4`).
  - **Hover**: `transform: perspective(700px) translateY(-6px) rotate3d(1,-.6,0,4deg)`, sombra `0 20px 50px rgba(0,0,0,.3)`, borda `rgba(accent-rgb,.55)`; transição `.35s cubic-bezier(.22,1,.36,1)`.
  - Card fantasma "+ Nova carteira": borda dashed, fundo transparente.
- Cores de exemplo por carteira: champanhe/bronze (accent), verde `#10b981`, âmbar `#f59e0b`.

### 3. Dashboard (layout "visão geral" — decisão final, sem variante "foco")
- **Header**: wordmark + chip da carteira ativa (pill com dot na cor da carteira, nome e chevron; clique volta à seleção; hover borda accent) · direita: toggle de tema, e-mail, "Sair".
- **Ordem das seções** (coluna, gap 18px, container máx. 1120px):
  1. Linha compacta: card "Importar CSV" (+ botão fantasma "Selecionar arquivo") e card "Alertas" (+ botão "Gerenciar") — manter comportamentos atuais de `CsvImport.tsx` e `AlertsPanel.tsx`.
  2. **3 summary cards**: Investido, Valor atual, Resultado. Label 11px uppercase + valor 28px tabular. Resultado: borda `rgba(up|down,.35)`, tinta radial da mesma cor, valor e % coloridos.
  3. **Linha de gráficos** `grid-template-columns: 1.6fr 1fr`:
     - *Evolução do patrimônio*: gráfico de área SVG (12 semanas), linha 2.5px na cor accent com gradiente de área (opacidade .28→0), pontos com tooltip, datas nas extremidades.
     - *Alocação*: donut via `conic-gradient` + `mask: radial-gradient(circle, transparent 49px, #000 50px)` (128px), centro com "N / ativos" em HTML sobreposto, legenda com dot colorido, ticker e %.
  4. **Nova Operação**: form em linha (Ticker com combobox existente, Tipo, Quantidade, Preço, Data, botão Adicionar) — mesma validação de `OperationForm.tsx`.
  5. **Posições**: tabela full-bleed (grid `1.1fr .7fr 1fr 1fr 1.1fr 1.1fr 1.1fr .75fr .75fr`; colunas Ticker, Qtd, PM, Cotação, Investido, Valor atual, Resultado, %, Carteira). Linhas clicáveis.
  6. **Comparativo de rentabilidade**: 3 barras (Carteira/CDI/Ibovespa), trilha `rgba(raised,.7)` 10px, preenchimento verde/vermelho `.75`, valor % à direita.
  7. **Operações**: tabela (Data mono 12px dim, Ticker, tag Compra/Venda, Qtd, Preço, Total, botão × de remover).

## Interactions & Behavior
- **Transições de tela**: cada tela entra com fadeUp (`opacity 0 → 1`, `translateY(16px) → 0`, `.55s cubic-bezier(.22,1,.36,1)`); seções do dashboard escalonadas (delays .06s a .3s).
- **Contadores animados**: ao entrar no dashboard (e ao trocar de carteira), valores monetários e % animam de 0 ao alvo com rAF ~1.2s e easeOutCubic (`1-(1-p)^3`). O mesmo progresso anima: desenho da linha do gráfico (`stroke-dasharray`/`dashoffset` com `pathLength=1`), opacidade da área, segmentos do donut, larguras das barras de benchmark.
- **Posições expansíveis**: clique na linha abre painel (fadeUp .3s) com sparkline 30d (SVG, verde se lucro/vermelho se prejuízo) e duas barras de progresso: "PM vs. cotação" e "Participação na carteira".
- **Nova operação**: ao adicionar, a linha entra no topo da tabela Operações com flash de fundo `rgba(accent-rgb,.22) → transparent` (1.2s). POST na API + refresh como hoje.
- **Remover operação**: × invisível até hover da linha (`opacity 0 → 1`); hover do × fica vermelho.
- **Hovers**: linhas de tabela `background: rgba(raised,.55)`; cards de carteira com tilt 3D (acima); botões primários com glow.
- **Toggle de tema**: botão circular 32px, borda edge, apenas ÍCONE SVG (`stroke: currentColor`, 15px): sol no tema escuro, lua no claro. `title` acessível ("Modo claro"/"Modo escuro"). Persistir em localStorage e aplicar antes do primeiro paint (script inline no index.html para evitar flash).
- Respeitar `prefers-reduced-motion` (desativar contadores/tilt/desenho de linha).
- Não usar libs de gráfico nem de animação — SVG + CSS + rAF.

## State Management
- **Front**: `user` (existente) · `wallets: Wallet[]` · `activeWalletId` (persistir em localStorage) · `theme` · dados por carteira (operations, portfolio, alertRules, benchmarks — como hoje, mas parametrizados por wallet) · `expandedTicker` · progresso de animação local.
- **Backend (novo)**: tabela `wallets (id, user_id, name, description, color, created_at)`; coluna `wallet_id` em `operations` e `alert_rules`; migração cria "Carteira B3 pessoal" e adota os dados existentes. Rotas: CRUD `/api/wallets`; rotas existentes filtram por `wallet_id`. Tipos novos em `shared/src/index.ts` (`Wallet`, `NewWallet`; `Operation`/`AlertRule` ganham `wallet_id`).

## Assets
Nenhum asset binário. Ícones são SVGs inline (24px, `stroke-width` 1.8–2.5, `stroke-linecap: round`): carteira (usado nos cards), sol/lua (toggle), chevron (chip de carteira). Todos presentes no HTML de referência.

## Files
- `Vetor Wallet v3.dc.html` — **referência principal**: fluxo completo, paleta final, cards-cartão, light mode, todas as animações. Abrir no navegador; o estado/lógica está no `<script>` da própria página.
- `Vetor Wallet v2.dc.html` — iteração anterior (mesma paleta; cards de carteira no estilo "bolso com mini-cartões"), apenas para contexto histórico.
