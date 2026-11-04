export async function fetchIbovespaReturn(from: string): Promise<number | null> {
  const token = process.env.BRAPI_TOKEN;
  const tokenParam = token ? `&token=${token}` : '';
  const url = `https://brapi.dev/api/quote/%5EBVSP?range=5y&interval=1mo&fundamental=false&history=true${tokenParam}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: { historicalDataPrice?: { date: number; close: number }[] }[];
    };

    const history = data.results?.[0]?.historicalDataPrice;
    if (!history || history.length < 2) return null;

    const fromTs = new Date(from + 'T00:00:00Z').getTime() / 1000;
    const sorted = [...history].sort((a, b) => a.date - b.date);
    const startPoint = sorted.find((p) => p.date >= fromTs) ?? sorted[0];
    const endPoint = sorted[sorted.length - 1];

    if (!startPoint?.close || !endPoint?.close) return null;
    return ((endPoint.close - startPoint.close) / startPoint.close) * 100;
  } catch {
    return null;
  }
}
