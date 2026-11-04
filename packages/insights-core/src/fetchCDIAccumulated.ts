import { isoToBcbDate } from './isoToBcbDate';

export async function fetchCDIAccumulated(from: string, to: string): Promise<number | null> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${isoToBcbDate(from)}&dataFinal=${isoToBcbDate(to)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: string; valor: string }[];
    if (!data.length) return null;

    let accumulated = 1;
    for (const { valor } of data) {
      accumulated *= 1 + parseFloat(valor.replace(',', '.')) / 100;
    }
    return (accumulated - 1) * 100;
  } catch {
    return null;
  }
}
