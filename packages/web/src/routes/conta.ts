/**
 * Funções puras da página `/conta` (T-093): máscara de exibição do celular,
 * normalização antes de enviar ao servidor e cálculo da saudação do header
 * (primeiro nome real quando disponível, senão o prefixo do e-mail — T-093
 * também move esse cálculo do `AppShell` para aqui, testado).
 *
 * O server aceita dígitos com ou sem `55` na frente e guarda só dígitos
 * (ver `packages/server/src/api/auth/service.ts` — `normalizePhone`/`isValidPhone`).
 * Aqui replicamos a MESMA lógica de máscara de exibição (não a validação —
 * essa é decisão do server) para não fazer round-trip só para formatar.
 */

/**
 * Formata dígitos de celular/telefone para exibição: "11987654321" →
 * "(11) 98765-4321"; fixo de 8 dígitos → "(11) 3265-4321". Entrada já com
 * máscara ou espaços passa primeiro por `onlyDigits`. Prefixo `55` do país é
 * removido antes de formatar (o server guarda com ou sem — a exibição não
 * precisa do código do país). Entradas fora do padrão (poucos dígitos, ainda
 * digitando) retornam os dígitos crus, sem máscara parcial forçada.
 */
export function formatPhoneForDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = onlyDigits(raw);
  if (digits.length > 11 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

/** Remove tudo que não for dígito. */
export function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Normaliza o celular digitado/mascarado no form antes de enviar no PATCH —
 * o server já normaliza de novo (`normalizePhone`), então esta função só
 * evita mandar máscara/espaços; não valida tamanho (o server responde 400
 * quando inválido).
 */
export function normalizePhoneForSubmit(raw: string): string {
  return onlyDigits(raw);
}

/**
 * Nome de exibição da saudação do header: primeiro nome real de `user.name`
 * quando existir e não for vazio; senão o prefixo do e-mail (fallback
 * pré-T-093, mantido para contas sem nome cadastrado).
 */
export function greetingName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed.split(/\s+/)[0];
  }
  return email.split('@')[0];
}

/**
 * Validação client do form "Alterar senha" (T-094): nova senha com pelo
 * menos 8 chars (mesma regra do server) e confirmação igual à nova senha.
 * Não valida a senha atual aqui — isso é decisão do server (400 genérico).
 */
export function isValidNewPassword(password: string): boolean {
  return password.length >= 8;
}

export function passwordsMatch(newPassword: string, confirmPassword: string): boolean {
  return newPassword === confirmPassword;
}
