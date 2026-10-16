const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Executa `fn` até `maxAttempts` vezes, com backoff linear (`delayMs × tentativa`)
 * entre elas, e relança o ÚLTIMO erro se todas falharem. É por isso que
 * `fetchQuotesStrict` lança em vez de degradar.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const backoff = delayMs * attempt;
        console.warn(
          `[snapshots] Attempt ${attempt}/${maxAttempts} failed, retrying in ${backoff}ms`
        );
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}
