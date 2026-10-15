# CLAUDE.md — @vetor-wallet/alerts-core

O **CRUD** de `alert_rules` — o SQL que ficava inteiro em
`packages/rest-api/src/api/routes/alerts.ts` (GET, POST, DELETE
`/api/alerts[/:id]`, backend ativo, sem UI — T-026). Categoria **Core**, módulo
**Portfolio** (ver `docs/MODULES.md`/`docs/PACKAGES.md`): a regra de alerta
olha preço/alocação do mesmo domínio de carteira/operações.

Nasceu na **T-104** (fatia alerts), já no formato-alvo: uma função por
arquivo, **`db` injetado**, Jest com testes em `tests/unit/tests/` e cobertura
**100% travada por `coverageThreshold`**. Molde seguido à risca:
`operations-core` (T-104, mesma tarefa-guarda-chuva) e `savings-core`
(T-110a/b).

## Invariantes (não quebrar)

- **Toda consulta filtra por `user_id`** — inclusive o re-SELECT depois do
  INSERT (T-065, mesma simetria de `operations-core`/`savings-core`), não só a
  checagem.
- **Ausência é `false`, não exceção.** `deleteAlertRule` devolve `false`
  quando a linha não existe **ou** é de outro usuário; a rota traduz os dois
  no mesmo 404 — distinguir transformaria a rota em sonda de existência.
- **Nada aqui normaliza o `ticker`.** A rota faz `trim().toUpperCase()` antes
  de chamar `createAlertRule` — mesma decisão do `operations-core`, para não
  criar uma segunda fonte de verdade da normalização.
- **Nenhuma validação de tipo/threshold mora aqui.** `VALID_TYPES`, o range de
  `threshold` e `isValidMoneyAmount` ficam na rota: são validação de entrada,
  não acesso a dado, e já existiam lá antes da extração — mover junto
  misturaria "mover SQL" com "mover regra de validação" na mesma PR.
- **Não importa `express`** nem nada de `rest-api`/`web` (regra 1 de
  `docs/PACKAGES.md`).

## O que NÃO veio para cá

- Validação de `ticker`/`type`/`threshold` (inclusive `isValidMoneyAmount`) —
  continua em `packages/rest-api/src/api/routes/alerts.ts`.
- Qualquer lógica de **disparo** do alerta (comparar preço atual com o
  threshold). Não existe ainda no app — este package só persiste a regra.

## Convenções

Formato-alvo (molde do `operations-core`/`savings-core`): **uma função por
arquivo**, **`db` injetado** (nunca importado), testes em
`tests/unit/tests/` importando por `src/...`, **Jest**, cobertura **100%**.

Ver também `CLAUDE.md` da raiz, `docs/PACKAGES.md` (regras de dependência) e
`docs/MODULES.md` (módulo Portfolio).
