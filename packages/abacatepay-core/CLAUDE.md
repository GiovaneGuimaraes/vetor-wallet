# CLAUDE.md — @vetor-wallet/abacatepay-core

Client HTTP da AbacatePay (cobrança Pix da assinatura) do Vetor Wallet,
extraído de `packages/server/src/api/services/abacatepay.ts` na T-098
(Ciclo 19 — arquitetura em módulos). Categoria **Integração**, módulo
**Billing** (ver `docs/MODULES.md`/`docs/PACKAGES.md`). Consumido hoje só
pelo `server` (via `@vetor-wallet/abacatepay-core`); `services/billing.ts`
(T-099) orquestra este client, não o inverso.

## Estrutura

```
src/
├── abacatepay.ts  # request()/createPixCharge()/checkPixCharge()/
│                  # simulatePixPayment(); AbacatePayError; isAbacatePayConfigured()
└── index.ts       # barrel
```

## Invariantes (não quebrar)

- **Envelope `{ data, error, success }` e a API pode responder HTTP 200 com
  `error` preenchido** — checar `res.ok` não basta. `request()` trata como
  erro sempre que `!res.ok || body == null || body.error != null ||
  body.data == null`.
- **Timeout de 10s**, não 5s como `brapi-core`. Cobrança não tem fallback
  nem cache: se o POST de criação estourar, o usuário fica sem QR Code —
  vale esperar o dobro antes de desistir.
- **Nunca degrada em silêncio.** Ao contrário de `fetchQuotes`, qualquer
  falha (rede, timeout, HTTP não-ok, envelope com erro, corpo não-JSON)
  vira `AbacatePayError` lançado — nunca `null`/valor vazio. Engolir falha
  de cobrança criaria assinatura sem pagamento (ou o inverso).
- **`AbacatePayError.status === 0` significa erro de rede/timeout** (nenhuma
  resposta chegou) — distinção importante para quem decide entre "recusado
  pelo provedor" e "não sabemos, pode ter passado".
- **Campos opcionais ausentes são omitidos do JSON** (`undefined` não
  serializa), nunca enviados como `null` — a API rejeita `null` onde espera
  objeto.
- **Env (`ABACATEPAY_API_KEY`/`ABACATEPAY_API_URL`) é lido dentro da
  função**, não no top-level do módulo — permite trocar entre casos de
  teste.
- **`simulatePixPayment` não checa `NODE_ENV`** de propósito — a guarda de
  ambiente (404 em produção) pertence à rota (T-070); este módulo fica como
  client HTTP puro e testável sem mexer em env de ambiente.
- **Nunca importa `@vetor-wallet/db`** (regra 2 de `docs/PACKAGES.md`,
  packages de Integração não tocam banco) nem `express`/`req`/`res`.

## Convenções

- Sem lib HTTP — `fetch` nativo com `AbortSignal.timeout`.
- Teste ao lado do código (`src/**/*.test.ts`), Vitest, mockando `fetch`
  global (`vi.stubGlobal`).

Ver também `CLAUDE.md` da raiz e `docs/MODULES.md` (módulo Billing).
