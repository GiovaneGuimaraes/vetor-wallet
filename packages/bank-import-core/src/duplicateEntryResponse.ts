/** Corpo padrão da resposta 409 de duplicata de importação (POST unitário). */
export function duplicateEntryResponse(row: Record<string, unknown> | undefined) {
  return {
    error: 'Lançamento já importado (externalId duplicado)',
    duplicate: true,
    entry: row ?? null,
  };
}
