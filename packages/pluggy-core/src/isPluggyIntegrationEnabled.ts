/**
 * Gate de ambiente da integração Pluggy (T-089b) — decisão do humano, 2026-08-12.
 *
 * ## Por que uma flag existe
 *
 * O conector **Meu Pluggy (200) é gratuito só para uso pessoal**. Oferecer a
 * integração a terceiros — que é o que "liberar no app" significa — exige
 * contrato pago com a Pluggy. A decisão foi construir a feature inteira e
 * mantê-la fora de produção até haver contrato: em `Staging` o dono do app usa
 * com a própria conta (uso pessoal, permitido), em `Production` ninguém alcança.
 *
 * ## Fail CLOSED
 *
 * Env ausente, vazia ou com valor desconhecido conta como **bloqueado**. O
 * desfecho de um typo (`Staginng`) não pode ser violar os termos da Pluggy —
 * então só o valor exato `Staging` libera, e todo o resto do universo bloqueia.
 * É o oposto deliberado do fail *open* da movimentação interna (T-088), onde
 * errar fechado sumiria com despesa real: aqui o custo de errar aberto é
 * jurídico e não aparece em nenhuma tela.
 *
 * Comparação é case-insensitive porque caixa não é a propriedade que protege:
 * `staging` é inequivocamente a mesma intenção, enquanto qualquer erro de
 * *letra* continua caindo no bloqueio.
 *
 * ## Terceira noção de ambiente, de propósito
 *
 * O `rest-api` já tem `NODE_ENV` e `BILLING_ENABLED`. `ENVIRONMENT` é uma
 * terceira e **pode divergir das outras duas** (`NODE_ENV=production` com
 * `ENVIRONMENT=Staging` é um estado válido). Para este gate `ENVIRONMENT` é a
 * **única autoridade** — amarrá-lo a `NODE_ENV` travaria o staging do dono do
 * app, que roda com `NODE_ENV=production`. Se um dia isso confundir, a saída é
 * unificar as três, não empilhar uma quarta.
 */
export const PLUGGY_ENABLED_ENVIRONMENT = 'staging';

export function isPluggyIntegrationEnabled(): boolean {
  return (process.env.ENVIRONMENT ?? '').trim().toLowerCase() === PLUGGY_ENABLED_ENVIRONMENT;
}
