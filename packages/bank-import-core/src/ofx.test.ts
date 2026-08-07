import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OFX_CATEGORY,
  DEFAULT_OFX_DESCRIPTION,
  decodeEntities,
  decodeOfx,
  mapOfxTransaction,
  ofxExternalId,
  parseOfx,
  parseOfxAmount,
  parseOfxDate,
  type RawOfxTransaction,
} from './ofx';
import { OFX_SGML_ITAU, OFX_XML_NUBANK, ofxSgmlLatin1Buffer } from './__fixtures__/ofx';

function raw(overrides: Partial<RawOfxTransaction> = {}): RawOfxTransaction {
  return {
    fitid: 'FIT-1',
    dtposted: '20260703120000[-3:BRT]',
    trnamt: '-10.50',
    memo: 'Mercado',
    name: null,
    trntype: 'DEBIT',
    ...overrides,
  };
}

describe('parseOfx — OFX 1.x SGML (T-085)', () => {
  it('lê as 3 transações do extrato SGML (tags de folha sem fechamento)', () => {
    const result = parseOfx(OFX_SGML_ITAU);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]).toEqual({
      fitid: 'ITAU00001',
      dtposted: '20260703120000[-3:BRT]',
      trnamt: '-152,90',
      memo: 'SUPERMERCADO AÇAÍ LTDA',
      name: null,
      trntype: 'DEBIT',
    });
  });

  it('não confunde campos de agregados fora do STMTTRN (LEDGERBAL/BANKACCTFROM)', () => {
    const result = parseOfx(OFX_SGML_ITAU);
    if (!result.ok) throw new Error('esperado ok');
    expect(result.transactions.map((t) => t.trnamt)).toEqual(['-152,90', '4800.00', '-39.90']);
  });
});

describe('parseOfx — OFX 2.x XML (T-085)', () => {
  it('lê as 4 transações e decodifica entidade no MEMO', () => {
    const result = parseOfx(OFX_XML_NUBANK);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toHaveLength(4);
    expect(result.transactions[0].memo).toBe('Freela Design & Cia');
    expect(result.transactions[0].fitid).toBe('NU-2026-07-10-001');
    // Transação sem FITID chega com null (não é inventado id nenhum).
    expect(result.transactions[2].fitid).toBeNull();
  });

  it('lê valores e datas independentemente da indentação do XML', () => {
    const result = parseOfx(OFX_XML_NUBANK);
    if (!result.ok) throw new Error('esperado ok');
    expect(result.transactions[1].trnamt).toBe('-88.30');
    expect(result.transactions[1].dtposted).toBe('20260712000000[-3:BRT]');
  });

  it('lê campos escritos na MESMA linha (XML compacto)', () => {
    const compact =
      '<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260101</DTPOSTED>' +
      '<TRNAMT>-5.00</TRNAMT><FITID>C1</FITID><MEMO>Cafe</MEMO></STMTTRN></BANKTRANLIST></OFX>';
    const result = parseOfx(compact);
    if (!result.ok) throw new Error('esperado ok');
    expect(result.transactions).toEqual([
      { fitid: 'C1', dtposted: '20260101', trnamt: '-5.00', memo: 'Cafe', name: null, trntype: 'DEBIT' },
    ]);
  });
});

describe('parseOfx — documento inválido', () => {
  it('rejeita corpo vazio', () => {
    expect(parseOfx('   ')).toEqual({ ok: false, error: 'Arquivo vazio' });
  });

  it('rejeita arquivo sem tag <OFX>', () => {
    const result = parseOfx('ticker,type,quantity,price,date\nPETR4,BUY,10,30.00,2026-07-01');
    expect(result.ok).toBe(false);
  });

  it('aceita OFX válido SEM nenhuma transação (extrato sem movimento)', () => {
    const result = parseOfx('<OFX>\n<BANKMSGSRSV1>\n</BANKMSGSRSV1>\n</OFX>');
    expect(result).toEqual({ ok: true, transactions: [] });
  });
});

describe('decodeOfx — charset', () => {
  it('decodifica como latin1 quando o header declara CHARSET:1252', () => {
    expect(decodeOfx(ofxSgmlLatin1Buffer())).toContain('SUPERMERCADO AÇAÍ LTDA');
  });

  it('decodifica como utf8 por default (OFX 2.x)', () => {
    expect(decodeOfx(Buffer.from(OFX_XML_NUBANK, 'utf8'))).toContain('Farmácia São João');
  });

  it('devolve string de entrada sem tocar', () => {
    expect(decodeOfx('<OFX>x</OFX>')).toBe('<OFX>x</OFX>');
  });
});

describe('decodeEntities', () => {
  it('decodifica nomeadas e numéricas', () => {
    expect(decodeEntities('A &amp; B &lt;x&gt; &#38; &#x26;')).toBe('A & B <x> & &');
  });

  it('deixa entidade desconhecida intacta', () => {
    expect(decodeEntities('&naoexiste;')).toBe('&naoexiste;');
  });
});

describe('parseOfxDate', () => {
  it('usa a data LOCAL do extrato e ignora o offset de fuso', () => {
    // 23:00 de 31/07 em BRT não vira 01/08 (isso jogaria o gasto no mês seguinte).
    expect(parseOfxDate('20260731230000[-3:BRT]')).toBe('2026-07-31');
  });

  it('aceita DTPOSTED só com data (sem hora nem fuso)', () => {
    expect(parseOfxDate('20260703')).toBe('2026-07-03');
  });

  it('aceita data real e rejeita data inexistente', () => {
    expect(parseOfxDate('20240229')).toBe('2024-02-29');
    expect(parseOfxDate('20260230')).toBeNull();
    expect(parseOfxDate('20261301')).toBeNull();
  });

  it('rejeita ausente/curta', () => {
    expect(parseOfxDate(null)).toBeNull();
    expect(parseOfxDate('2026-07')).toBeNull();
  });
});

describe('parseOfxAmount', () => {
  it('aceita ponto e vírgula decimal, com e sem sinal', () => {
    expect(parseOfxAmount('-152,90')).toBe(-152.9);
    expect(parseOfxAmount('4800.00')).toBe(4800);
    expect(parseOfxAmount('+12.34')).toBe(12.34);
    expect(parseOfxAmount(' -1.00 ')).toBe(-1);
  });

  it('rejeita separador de milhar (ambíguo) e texto', () => {
    expect(parseOfxAmount('1.234,56')).toBeNull();
    expect(parseOfxAmount('R$ 10,00')).toBeNull();
    expect(parseOfxAmount(null)).toBeNull();
  });
});

describe('mapOfxTransaction', () => {
  it('débito vira despesa com categoria normalizada do MEMO', () => {
    const result = mapOfxTransaction(raw({ trnamt: '-152,90', memo: 'SUPERMERCADO AÇAÍ LTDA' }));
    expect(result).toEqual({
      ok: true,
      transaction: {
        fitid: 'FIT-1',
        externalId: 'ofx:FIT-1',
        date: '2026-07-03',
        amount: 152.9,
        description: 'SUPERMERCADO AÇAÍ LTDA',
        category: 'supermercado açaí ltda',
        entryType: 'expense',
      },
    });
  });

  it('crédito vira renda e o valor é sempre absoluto', () => {
    const result = mapOfxTransaction(raw({ trnamt: '4800.00', memo: 'SALARIO' }));
    if (!result.ok) throw new Error('esperado ok');
    expect(result.transaction.entryType).toBe('income');
    expect(result.transaction.amount).toBe(4800);
  });

  it('usa NAME quando não há MEMO, e cai nos defaults quando não há nenhum', () => {
    const withName = mapOfxTransaction(raw({ memo: null, name: 'PAGTO BOLETO' }));
    if (!withName.ok) throw new Error('esperado ok');
    expect(withName.transaction.description).toBe('PAGTO BOLETO');
    expect(withName.transaction.category).toBe('pagto boleto');

    const empty = mapOfxTransaction(raw({ memo: null, name: null }));
    if (!empty.ok) throw new Error('esperado ok');
    expect(empty.transaction.description).toBe(DEFAULT_OFX_DESCRIPTION);
    expect(empty.transaction.category).toBe(DEFAULT_OFX_CATEGORY);
  });

  it('ignora TRNTYPE e decide pelo SINAL do TRNAMT', () => {
    // TRNTYPE mentindo (CREDIT com valor negativo): o sinal manda.
    const result = mapOfxTransaction(raw({ trntype: 'CREDIT', trnamt: '-1.00' }));
    if (!result.ok) throw new Error('esperado ok');
    expect(result.transaction.entryType).toBe('expense');
  });

  it('rejeita FITID ausente sem inventar id', () => {
    expect(mapOfxTransaction(raw({ fitid: null }))).toEqual({
      ok: false,
      reason: 'FITID ausente',
    });
  });

  it('rejeita FITID longo demais para a coluna com o prefixo ofx:', () => {
    const result = mapOfxTransaction(raw({ fitid: 'x'.repeat(255) }));
    expect(result.ok).toBe(false);
  });

  it('rejeita DTPOSTED inexistente, TRNAMT ilegível, zero e com 3 casas decimais', () => {
    expect(mapOfxTransaction(raw({ dtposted: '20260230' })).ok).toBe(false);
    expect(mapOfxTransaction(raw({ trnamt: 'abc' })).ok).toBe(false);
    expect(mapOfxTransaction(raw({ trnamt: '0.00' })).ok).toBe(false);
    expect(mapOfxTransaction(raw({ trnamt: '-10.505' })).ok).toBe(false);
  });

  it('usa a convenção de namespace ofx: da T-084', () => {
    expect(ofxExternalId('ITAU00001')).toBe('ofx:ITAU00001');
  });
});
