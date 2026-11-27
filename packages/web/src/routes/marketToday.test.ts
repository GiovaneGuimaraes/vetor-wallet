import { describe, expect, it } from 'vitest';
import {
  changeTone,
  formatAsOf,
  formatChange,
  formatPrice,
  formatTradedValue,
  ownedTickerSet,
} from './marketToday';

// Intl insere NBSP entre "R$" e o número; normaliza para comparar.
const norm = (s: string) => s.replace(/ /g, ' ');

describe('marketToday', () => {
  it('formatChange mostra sinal explícito e vírgula decimal', () => {
    expect(formatChange(3.2)).toBe('+3,20%');
    expect(formatChange(-1.054)).toBe('-1,05%');
    expect(formatChange(0)).toBe('0,00%');
  });

  it('formatChange não mostra sinal quando arredonda para zero', () => {
    expect(formatChange(0.004)).toBe('0,00%');
    expect(formatChange(-0.004)).toBe('0,00%');
  });

  it('changeTone segue o valor arredondado exibido', () => {
    expect(changeTone(1)).toBe('up');
    expect(changeTone(-1)).toBe('down');
    expect(changeTone(0.004)).toBe('flat');
    expect(changeTone(0)).toBe('flat');
  });

  it('formatPrice em BRL', () => {
    expect(norm(formatPrice(1234.5))).toBe('R$ 1.234,50');
  });

  it('formatTradedValue usa close × volume em notação compacta', () => {
    const q = {
      ticker: 'X',
      name: 'X',
      close: 10,
      change: 0,
      volume: 1_500_000,
      marketCap: null,
      sector: null,
    };
    expect(norm(formatTradedValue(q))).toMatch(/^R\$ 15 mi/);
  });

  it('formatAsOf converte para o fuso de Brasília', () => {
    expect(formatAsOf('2026-11-26T15:05:00.000Z')).toBe('26/11 12:05');
    expect(formatAsOf('lixo')).toBeNull();
  });

  it('ownedTickerSet normaliza caixa e tolera ausência', () => {
    expect(ownedTickerSet([{ ticker: 'petr4' }]).has('PETR4')).toBe(true);
    expect(ownedTickerSet(null).size).toBe(0);
  });
});
