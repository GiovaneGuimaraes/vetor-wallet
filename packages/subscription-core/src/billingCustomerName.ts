/** Nome usado quando nem o perfil nem o e-mail rendem um nome. */
export const FALLBACK_CUSTOMER_NAME = 'Cliente Vetor Wallet';

/** Teto do nome mandado ao provedor (o perfil já limita; o e-mail não). */
export const MAX_CUSTOMER_NAME_LENGTH = 100;

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Nome do cliente na AbacatePay (decisão 2 do humano: só e-mail + nome, sem
 * CPF). `name` do perfil é opcional no app; vazio, usa a parte do e-mail antes
 * do `@`, com pontuação (`.`, `_`, `+`, `-`…) virando espaço — ninguém se chama
 * `joao.silva+teste`. Sobrando nada, `FALLBACK_CUSTOMER_NAME`. A rota é quem
 * busca e-mail/nome no auth-core; esta função só decide o texto.
 */
export const billingCustomerName = (args: { name: string | null; email: string }): string => {
  const fromProfile = collapse(args.name ?? '');
  const localPart = args.email.split('@')[0];
  const fromEmail = collapse(localPart.replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ]/g, ' '));
  const chosen = fromProfile || fromEmail || FALLBACK_CUSTOMER_NAME;
  return chosen.slice(0, MAX_CUSTOMER_NAME_LENGTH).trimEnd();
};
