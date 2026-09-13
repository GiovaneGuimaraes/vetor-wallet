import { CONFIRMATION_CODE_LENGTH } from './authConfirm';
import { passwordPolicyMet } from './passwordPolicy';

/**
 * Regras da recuperação de senha (T-108b, consumindo a T-108a).
 *
 * ## A doutrina do 204 que esta tela não pode reabrir
 *
 * `POST /api/auth/forgot-password` e `POST /api/auth/reset-password` respondem
 * **204 sempre** — inclusive e-mail sem cadastro, código errado/vencido ou
 * senha recusada pela política do pool (ver `router.ts` e
 * `packages/cognito-core/CLAUDE.md`). Só corpo malformado (400) ou falta de
 * configuração do Cognito (503) escapam disso, e os dois são falhas reais de
 * transporte, não uma resposta sobre a conta.
 *
 * Consequência para estas funções: elas só decidem **quando o botão trava**
 * (formato local, antes do POST) — nunca interpretam o resultado do POST como
 * prova de que o e-mail existe ou de que a senha trocou. Essa interpretação
 * fica fora daqui, no componente, que sempre volta ao login com um aviso
 * condicional ("se houver conta...", "se o código estava certo...").
 */

/**
 * Por que o botão de "enviar código" está travado — ou `null` se está
 * liberado. Só checa formato local (e-mail não vazio); o backend não valida
 * o formato do e-mail de propósito, e não é o front que faria isso funcionar
 * como oráculo de conta.
 */
export function forgotDisabledReason(params: { email: string; loading: boolean }): string | null {
  if (params.loading) return 'Enviando...';
  if (!params.email.trim()) return 'Digite seu e-mail';
  return null;
}

/**
 * Por que o botão de "trocar senha" está travado — ou `null` se está
 * liberado. Mesmo formato do `confirmDisabledReason` (código de
 * `CONFIRMATION_CODE_LENGTH` dígitos) mais a política de senha da
 * `passwordPolicy.ts` sobre a senha nova — a mesma lista visível que o
 * cadastro usa, para o mesmo motivo: a recusa do Cognito é genérica.
 */
export function resetDisabledReason(params: {
  code: string;
  newPassword: string;
  loading: boolean;
}): string | null {
  if (params.loading) return 'Confirmando...';
  if (params.code.length < CONFIRMATION_CODE_LENGTH) {
    return `Digite os ${CONFIRMATION_CODE_LENGTH} dígitos do código`;
  }
  if (!passwordPolicyMet(params.newPassword)) {
    return 'A senha nova não atende aos requisitos listados abaixo do campo';
  }
  return null;
}
