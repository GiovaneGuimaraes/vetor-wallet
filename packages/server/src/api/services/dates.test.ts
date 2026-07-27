import { describe, expect, it } from 'vitest';
import { isValidIsoDate, parseDaysParam } from './dates';

describe('isValidIsoDate', () => {
  it('aceita datas reais comuns', () => {
    expect(isValidIsoDate('2026-07-25')).toBe(true);
    expect(isValidIsoDate('2026-01-01')).toBe(true);
    expect(isValidIsoDate('2026-12-31')).toBe(true);
  });

  it('aceita 29/02 em ano bissexto', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
  });

  it('rejeita 29/02 em ano não bissexto', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
  });

  it('respeita meses curtos', () => {
    expect(isValidIsoDate('2026-04-30')).toBe(true);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
  });

  it('rejeita mês inexistente', () => {
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-01')).toBe(false);
  });

  it('rejeita dia inexistente', () => {
    expect(isValidIsoDate('2026-07-00')).toBe(false);
    expect(isValidIsoDate('2026-07-32')).toBe(false);
  });

  it('rejeita formato inválido', () => {
    expect(isValidIsoDate('2026-7-25')).toBe(false);
    expect(isValidIsoDate('25-07-2026')).toBe(false);
    expect(isValidIsoDate('2026/07/25')).toBe(false);
    expect(isValidIsoDate('2026-07-25T00:00:00Z')).toBe(false);
  });

  it('rejeita strings vazias e valores não-string', () => {
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
    expect(isValidIsoDate(123)).toBe(false);
  });
});

describe('parseDaysParam (T-068)', () => {
  it('param ausente devolve o default', () => {
    expect(parseDaysParam(undefined, 90, 365)).toBe(90);
  });

  it('aceita inteiro decimal dentro da faixa', () => {
    expect(parseDaysParam('1', 90, 365)).toBe(1);
    expect(parseDaysParam('30', 90, 365)).toBe(30);
    expect(parseDaysParam('365', 90, 365)).toBe(365);
  });

  it('rejeita não-inteiro, negativo, texto, espaços, array e número', () => {
    expect(parseDaysParam('1.5', 90, 365)).toBeNull();
    expect(parseDaysParam('-1', 90, 365)).toBeNull();
    expect(parseDaysParam('abc', 90, 365)).toBeNull();
    expect(parseDaysParam(' 5', 90, 365)).toBeNull();
    expect(parseDaysParam(['5', '6'], 90, 365)).toBeNull();
    expect(parseDaysParam(5, 90, 365)).toBeNull();
  });

  it('rejeita fora da faixa [1, maxDays]', () => {
    expect(parseDaysParam('0', 90, 365)).toBeNull();
    expect(parseDaysParam('366', 90, 365)).toBeNull();
  });
});
