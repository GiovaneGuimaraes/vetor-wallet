/**
 * Gate de ambiente da integração Pluggy (T-089b, 2026-08-12 → revisto 2026-11-08).
 *
 * ## Por que existia um gate por `ENVIRONMENT`
 *
 * O conector **Meu Pluggy (200) é gratuito só para uso pessoal**. Oferecer a
 * integração a terceiros sem contrato pago violaria os termos da Pluggy — por
 * isso a integração nasceu travada fora de `Staging`.
 *
 * ## Por que agora sempre libera (decisão do humano, 2026-11-08)
 *
 * **Não existe deploy de produção** (`packages/rest-api/CLAUDE.md`, "Deploy:
 * nenhum recurso existe ainda") — nenhum usuário real alcança este código hoje,
 * então travar por `ENVIRONMENT` não protege ninguém agora e só complica o
 * ambiente local. A landing já anuncia a integração em ambos os ambientes.
 *
 * **Isto não resolve o contrato pago** — ele continua pendente em
 * `docs/multi-agent/TODO-HUMANO.md` ("Contrato pago com a Pluggy — bloqueia
 * ENTREGAR a T-089, não construí-la") e bloqueia abrir isto para usuários reais
 * em produção. Quando houver deploy de verdade com usuários de terceiros, essa
 * pendência tem de ser resolvida ANTES — este código não vai lembrar ninguém.
 */
export function isPluggyIntegrationEnabled(): boolean {
  return true;
}
