import { describe, expect, it } from 'vitest';
import { formatAxisValue, MIN_ABS_PADDING } from './chartAxisFormat';

describe('formatAxisValue', () => {
  it('abrevia bilhões com 1 casa decimal', () => {
    expect(formatAxisValue(3_400_000_000)).toBe('R$ 3,4 bi');
  });

  it('abrevia milhões com 1 casa decimal', () => {
    expect(formatAxisValue(1_200_000)).toBe('R$ 1,2 mi');
  });

  it('abrevia milhares com 1 casa decimal', () => {
    expect(formatAxisValue(12_300)).toBe('R$ 12,3 mil');
  });

  it('mantém o formato de moeda cheio abaixo de mil', () => {
    expect(formatAxisValue(823.1)).toBe(
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(823.1)
    );
  });

  it('preserva o sinal negativo antes de "R$" para valores abreviados', () => {
    expect(formatAxisValue(-3_400_000_000)).toBe('-R$ 3,4 bi');
    expect(formatAxisValue(-1_200_000)).toBe('-R$ 1,2 mi');
    expect(formatAxisValue(-12_300)).toBe('-R$ 12,3 mil');
  });

  it('mantém o sinal negativo do Intl.NumberFormat abaixo de mil', () => {
    const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    expect(formatAxisValue(-823.1)).toBe(fmt.format(-823.1));
  });

  it('trata zero como valor cheio, não abreviado', () => {
    const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    expect(formatAxisValue(0)).toBe(fmt.format(0));
  });

  it('exporta MIN_ABS_PADDING como margem mínima absoluta', () => {
    expect(MIN_ABS_PADDING).toBe(1);
  });
});
