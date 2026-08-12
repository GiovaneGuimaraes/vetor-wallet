/**
 * Erro tipado do registro de items da Pluggy (T-089a).
 *
 * Core não conhece HTTP (regra 1 de `docs/PACKAGES.md`): quem traduz `code` em
 * status é a rota (fase (b)) ou o CLI. Os códigos:
 *
 * - `INVALID_ITEM_ID` — `itemId` vazio, não-string ou fora do formato aceito.
 * - `ITEM_ALREADY_LINKED` — o `item_id` já pertence a **outro** usuário. A
 *   mensagem é deliberadamente vaga: dizer "esse item é do usuário X" (ou
 *   responder 403 em vez de erro genérico) confirmaria a existência do vínculo
 *   de terceiro. Para o dono, religar o mesmo item é sucesso (idempotente).
 */
export type PluggyItemErrorCode = 'INVALID_ITEM_ID' | 'ITEM_ALREADY_LINKED';

export class PluggyItemError extends Error {
  readonly code: PluggyItemErrorCode;

  constructor(code: PluggyItemErrorCode, message: string) {
    super(message);
    this.name = 'PluggyItemError';
    this.code = code;
  }
}
