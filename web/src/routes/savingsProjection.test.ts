import { describe, it, expect } from 'vitest';
import type { SavingsEntry, SavingsEntryType } from '@vetor-wallet/shared';
import {
  RATE_SAMPLE_MONTHS,
  deriveMonthlyRatePct,
  formatDecimalInput,
  parseMonthsInput,
  parseNonNegativeInput,
  projectSavings,
} from './savingsProjection';
import { currentMonthKey, shiftMonth } from './expenseMonth';

let nextId = 1;

/**
 * Lançamento de poupança para os testes. As datas são sempre **relativas** ao
 * mês corrente (`shiftMonth`), nunca fixas — a derivação de taxa ordena meses,
 * então datas cravadas envelheceriam a suíte.
 */
function makeEntry(type: SavingsEntryType, amount: number, date: string): SavingsEntry {
  return {
    id: nextId++,
    user_id: 1,
    type,
    amount,
    date,
    note: '',
    created_at: date,
  };
}

/** `YYYY-MM-DD` no mês deslocado `delta` meses a partir do mês corrente. */
function dayIn(delta: number, day = 10): string {
  return `${shiftMonth(currentMonthKey(), delta)}-${String(day).padStart(2, '0')}`;
}

describe('projectSavings', () => {
  it('aplica juros compostos mensais', () => {
    // 1000 × 1,01^12 = 1126,825…
    expect(projectSavings(1000, 1, 12)).toEqual({ futureValue: 1126.83, totalYield: 126.83 });
  });

  it('prazo 0 devolve o próprio valor inicial e rendimento zero', () => {
    expect(projectSavings(1000, 0.9, 0)).toEqual({ futureValue: 1000, totalYield: 0 });
  });

  it('taxa 0 não rende nada em nenhum prazo', () => {
    expect(projectSavings(2500, 0, 36)).toEqual({ futureValue: 2500, totalYield: 0 });
  });

  it('valor inicial 0 é simulação válida e rende 0', () => {
    expect(projectSavings(0, 1.5, 24)).toEqual({ futureValue: 0, totalYield: 0 });
  });

  it('curto-circuita inicial 0 mesmo com taxa/prazo extremos que estourariam Math.pow', () => {
    // Sem o curto-circuito, 0 × Infinity = NaN faria isto devolver null.
    expect(projectSavings(0, 100, 5000)).toEqual({ futureValue: 0, totalYield: 0 });
  });

  it('suporta taxa alta', () => {
    // 100 × 2^10 = 102400
    expect(projectSavings(100, 100, 10)).toEqual({ futureValue: 102400, totalYield: 102300 });
  });

  it('arredonda em centavos e mantém inicial + rendimento = valor futuro', () => {
    const result = projectSavings(1234.56, 0.87, 7);
    expect(result).not.toBeNull();
    const { futureValue, totalYield } = result!;
    // 2 casas decimais em ambos os campos
    expect(futureValue).toBe(Math.round(futureValue * 100) / 100);
    expect(totalYield).toBe(Math.round(totalYield * 100) / 100);
    expect(Math.round((1234.56 + totalYield) * 100) / 100).toBe(futureValue);
  });

  it('rejeita entradas inválidas', () => {
    expect(projectSavings(Number.NaN, 1, 12)).toBeNull();
    expect(projectSavings(1000, Number.NaN, 12)).toBeNull();
    expect(projectSavings(1000, 1, Number.NaN)).toBeNull();
    expect(projectSavings(Number.POSITIVE_INFINITY, 1, 12)).toBeNull();
    expect(projectSavings(-1, 1, 12)).toBeNull();
    expect(projectSavings(1000, -0.5, 12)).toBeNull();
    expect(projectSavings(1000, 1, -3)).toBeNull();
    expect(projectSavings(1000, 1, 12.5)).toBeNull();
  });

  it('rejeita resultado que estoura o alcance de number', () => {
    expect(projectSavings(1e308, 100, 5000)).toBeNull();
  });

  it('T-054: valida taxa/prazo mesmo com inicial 0 (validação vem antes do curto-circuito)', () => {
    // O curto-circuito de `initial === 0` só existe para pular a potência
    // quando a simulação é válida — não para mascarar uma entrada inválida
    // nos OUTROS argumentos. Sem a validação vindo primeiro, `projectSavings`
    // devolveria `{ futureValue: 0, totalYield: 0 }` para uma taxa/prazo que
    // não descrevem simulação nenhuma.
    expect(projectSavings(0, Number.NaN, 12)).toBeNull();
    expect(projectSavings(0, -1, 12)).toBeNull();
    expect(projectSavings(0, 1, -3)).toBeNull();
    expect(projectSavings(0, 1, 12.5)).toBeNull();
  });
});

describe('deriveMonthlyRatePct', () => {
  it('devolve null sem nenhum lançamento', () => {
    expect(deriveMonthlyRatePct([])).toBeNull();
  });

  it('devolve null quando não há rendimento no histórico', () => {
    const entries = [
      makeEntry('DEPOSIT', 1000, dayIn(-2, 5)),
      makeEntry('WITHDRAW', 100, dayIn(-1, 5)),
    ];
    expect(deriveMonthlyRatePct(entries)).toBeNull();
  });

  it('devolve null quando o rendimento não tem saldo anterior (base ≤ 0)', () => {
    // Aporte e rendimento no mesmo mês: no início do mês o saldo era 0.
    const entries = [
      makeEntry('DEPOSIT', 1000, dayIn(-1, 3)),
      makeEntry('YIELD', 9, dayIn(-1, 28)),
    ];
    expect(deriveMonthlyRatePct(entries)).toBeNull();
  });

  it('deriva a taxa de um único mês sobre o saldo do início do mês', () => {
    const entries = [
      makeEntry('DEPOSIT', 1000, dayIn(-2, 5)),
      // Aporte no meio do mês do rendimento: NÃO entra na base.
      makeEntry('DEPOSIT', 5000, dayIn(-1, 20)),
      makeEntry('YIELD', 10, dayIn(-1, 28)),
    ];
    expect(deriveMonthlyRatePct(entries)).toBe(1);
  });

  it('soma vários rendimentos do mesmo mês antes de dividir pela base', () => {
    const entries = [
      makeEntry('DEPOSIT', 1000, dayIn(-2, 5)),
      makeEntry('YIELD', 4, dayIn(-1, 10)),
      makeEntry('YIELD', 6, dayIn(-1, 25)),
    ];
    expect(deriveMonthlyRatePct(entries)).toBe(1);
  });

  it('faz média aritmética dos meses elegíveis', () => {
    const entries = [
      makeEntry('DEPOSIT', 1000, dayIn(-3, 1)),
      makeEntry('YIELD', 10, dayIn(-2, 28)), // base 1000 → 1%
      makeEntry('YIELD', 20, dayIn(-1, 28)), // base 1010 → 1,9802%
    ];
    const rate = deriveMonthlyRatePct(entries);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo((1 + (20 / 1010) * 100) / 2, 4);
  });

  it('desconta retiradas anteriores na base do mês', () => {
    const entries = [
      makeEntry('DEPOSIT', 1000, dayIn(-2, 5)),
      makeEntry('WITHDRAW', 500, dayIn(-2, 20)),
      makeEntry('YIELD', 10, dayIn(-1, 28)), // base 500 → 2%
    ];
    expect(deriveMonthlyRatePct(entries)).toBe(2);
  });

  it(`considera apenas os ${RATE_SAMPLE_MONTHS} meses de rendimento mais recentes`, () => {
    // Saldo acumulado enquanto os lançamentos são criados, para que cada
    // rendimento seja uma fração exata da base do seu mês.
    const entries: SavingsEntry[] = [];
    let balance = 0;
    const add = (type: SavingsEntryType, amount: number, date: string) => {
      entries.push(makeEntry(type, amount, date));
      balance += type === 'WITHDRAW' ? -amount : amount;
    };

    add('DEPOSIT', 1000, dayIn(-(RATE_SAMPLE_MONTHS + 3), 1));
    // Mês antigo com taxa muito diferente (10%), fora da janela da amostra.
    add('YIELD', balance * 0.1, dayIn(-(RATE_SAMPLE_MONTHS + 2), 15));
    // Os N meses recentes rendem exatamente 1% sobre o saldo do início do mês.
    for (let i = RATE_SAMPLE_MONTHS; i >= 1; i--) {
      add('YIELD', balance * 0.01, dayIn(-i, 15));
    }

    expect(deriveMonthlyRatePct(entries)).toBe(1);
  });

  it('arredonda a taxa em 4 casas decimais', () => {
    const entries = [
      makeEntry('DEPOSIT', 3000, dayIn(-2, 1)),
      makeEntry('YIELD', 7, dayIn(-1, 15)), // 7/3000 = 0,2333…%
    ];
    expect(deriveMonthlyRatePct(entries)).toBe(0.2333);
  });

  it('exclui o mês corrente (incompleto) da amostra', () => {
    const entries = [
      makeEntry('DEPOSIT', 1000, dayIn(-2, 5)),
      makeEntry('YIELD', 10, dayIn(-1, 28)), // mês fechado: base 1000 → 1%
      // Rendimento parcial do mês em curso, muito menor por ainda não ter
      // terminado — se entrasse na média, achataria a taxa para baixo.
      makeEntry('YIELD', 1, dayIn(0, 5)),
    ];
    expect(deriveMonthlyRatePct(entries)).toBe(1);
  });

  it('devolve null quando só há rendimento no mês corrente', () => {
    const entries = [
      makeEntry('DEPOSIT', 1000, dayIn(-1, 1)),
      makeEntry('YIELD', 5, dayIn(0, 5)),
    ];
    expect(deriveMonthlyRatePct(entries)).toBeNull();
  });

  it('a taxa derivada alimenta projectSavings', () => {
    const entries = [
      makeEntry('DEPOSIT', 1000, dayIn(-2, 5)),
      makeEntry('YIELD', 10, dayIn(-1, 28)),
    ];
    const rate = deriveMonthlyRatePct(entries);
    expect(rate).toBe(1);
    expect(projectSavings(1010, rate!, 12)).toEqual({
      futureValue: 1138.09,
      totalYield: 128.09,
    });
  });
});

describe('parseNonNegativeInput', () => {
  it('aceita vírgula decimal', () => {
    expect(parseNonNegativeInput('1234,56')).toBe(1234.56);
    expect(parseNonNegativeInput(' 0,9 ')).toBe(0.9);
  });

  it('aceita zero (diferente de parseMoneyInput)', () => {
    expect(parseNonNegativeInput('0')).toBe(0);
  });

  it('rejeita vazio, texto e negativo', () => {
    expect(parseNonNegativeInput('')).toBeNull();
    expect(parseNonNegativeInput('   ')).toBeNull();
    expect(parseNonNegativeInput('abc')).toBeNull();
    expect(parseNonNegativeInput('-1')).toBeNull();
    expect(parseNonNegativeInput('Infinity')).toBeNull();
  });
});

describe('formatDecimalInput', () => {
  it('formata com vírgula decimal e o número de casas pedido', () => {
    expect(formatDecimalInput(1234.5, 2)).toBe('1234,50');
    expect(formatDecimalInput(0, 2)).toBe('0,00');
    expect(formatDecimalInput(0.233333, 4)).toBe('0,2333');
  });

  it('arredonda ao número de casas pedido', () => {
    expect(formatDecimalInput(1.005, 2)).toBe('1,00'); // ruído de float é aceito
    expect(formatDecimalInput(1.999, 2)).toBe('2,00');
  });

  it('o resultado é aceito de volta por parseNonNegativeInput', () => {
    const formatted = formatDecimalInput(1500.7, 2);
    expect(parseNonNegativeInput(formatted)).toBe(1500.7);
  });
});

describe('parseMonthsInput', () => {
  it('aceita inteiros ≥ 0', () => {
    expect(parseMonthsInput('0')).toBe(0);
    expect(parseMonthsInput('12')).toBe(12);
    expect(parseMonthsInput(' 240 ')).toBe(240);
  });

  it('rejeita vazio, fracionário, negativo e texto', () => {
    expect(parseMonthsInput('')).toBeNull();
    expect(parseMonthsInput('12,5')).toBeNull();
    expect(parseMonthsInput('12.5')).toBeNull();
    expect(parseMonthsInput('-6')).toBeNull();
    expect(parseMonthsInput('abc')).toBeNull();
  });
});
