/**
 * Tamanho máximo mandado à API. Medido em 2026-11-08: 80 caracteres passam; 200 e
 * 1000 dão 422. O limite exato entre 80 e 200 não foi sondado — 80 é o maior valor
 * comprovado.
 */
export const MAX_DESCRIPTION_LENGTH = 80;

/** Texto usado quando a descrição inteira some na sanitização. */
export const FALLBACK_DESCRIPTION = 'Vetor Wallet';

/**
 * Deixa a `description` de uma cobrança no conjunto que a AbacatePay aceita.
 *
 * A API responde 400 `Disallowed character in description` para caractere fora de
 * um conjunto estreito, e o app só enxergava "provedor indisponível" (502). Medido
 * contra a API v2 em 2026-11-08: caem o travessão `—`/`–`, aspas tipográficas, `€`,
 * `$` e o espaço não separável; passam letras (acentuadas inclusive), dígitos e
 * `- . , : ; / # & ( ) @ % + = _`. O nome do plano vem do banco, então o travessão
 * que o app mesmo punha entre "Vetor Wallet" e o plano já bastava para derrubar toda
 * assinatura.
 *
 * Travessões viram hífen (preserva o sentido); o resto fora do conjunto vira espaço.
 * Espaços repetidos colapsam, o texto é truncado em `MAX_DESCRIPTION_LENGTH` e o que
 * sobra vazio cai em `FALLBACK_DESCRIPTION`.
 */
export const sanitizeDescription = (raw: string): string => {
  const cleaned = raw
    .replace(/[‐-―]/g, '-')
    .replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ .,:;/#&()@%+=_-]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTION_LENGTH)
    .trimEnd();

  return cleaned.length > 0 ? cleaned : FALLBACK_DESCRIPTION;
};
