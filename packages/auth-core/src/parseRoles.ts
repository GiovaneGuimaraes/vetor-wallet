/**
 * Lê `users.roles` (JSON em coluna TEXT). Fail-safe: JSON inválido ou não-array
 * vira `[]`, nunca lança — uma exceção aqui derrubaria o `requireAdmin` de toda
 * request.
 */
export function parseRoles(json: unknown): string[] {
  try {
    const parsed = JSON.parse(typeof json === 'string' ? json : '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
