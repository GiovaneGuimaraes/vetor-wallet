/**
 * Extratos OFX de teste (T-085). Módulo comum (não `.test.ts`) porque é
 * compartilhado pelo teste do parser e pelo teste da rota — importar de um
 * `.test.ts` faria a suíte daquele arquivo rodar duas vezes. Excluído do build
 * pelo `tsconfig.json` do pacote (`src/**\/__fixtures__/**`).
 *
 * Os dois formatos são reproduções fiéis do que os bancos exportam, com as
 * excentricidades que importam para o parser:
 *
 * - **OFX 1.x SGML** (estilo Itaú/BB/Bradesco): header `OFXHEADER:100` em linhas
 *   `CHAVE:valor`, `CHARSET:1252`, tags de folha SEM fechamento, `DTPOSTED` com
 *   fuso `[-3:BRT]`, MEMO acentuado e um valor com VÍRGULA decimal.
 * - **OFX 2.x XML** (estilo Nubank/Inter/C6): declaração XML + `<?OFX ...?>`,
 *   tudo fechado, UTF-8, entidade `&amp;` no MEMO.
 */

/** OFX 1.x SGML — 2 débitos e 1 crédito válidos, todos com FITID. */
export const OFX_SGML_ITAU = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>341
<ACCTID>12345-6
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260701000000[-3:BRT]
<DTEND>20260731235959[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260703120000[-3:BRT]
<TRNAMT>-152,90
<FITID>ITAU00001
<MEMO>SUPERMERCADO AÇAÍ LTDA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260705000000[-3:BRT]
<TRNAMT>4800.00
<FITID>ITAU00002
<MEMO>SALARIO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260731230000[-3:BRT]
<TRNAMT>-39.90
<FITID>ITAU00003
<MEMO>ASSINATURA STREAMING
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>4607.20
<DTASOF>20260731235959[-3:BRT]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

/**
 * OFX 2.x XML — 1 crédito, 1 débito, e duas transações que devem ser
 * REJEITADAS: uma sem FITID e uma com DTPOSTED impossível (`20260230`).
 */
export const OFX_XML_NUBANK = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>BRL</CURDEF>
        <BANKTRANLIST>
          <DTSTART>20260701000000[-3:BRT]</DTSTART>
          <DTEND>20260731000000[-3:BRT]</DTEND>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20260710000000[-3:BRT]</DTPOSTED>
            <TRNAMT>1200.50</TRNAMT>
            <FITID>NU-2026-07-10-001</FITID>
            <MEMO>Freela Design &amp; Cia</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260712000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-88.30</TRNAMT>
            <FITID>NU-2026-07-12-002</FITID>
            <MEMO>Farmácia São João</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260713000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-10.00</TRNAMT>
            <MEMO>Transacao sem FITID</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260230000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-20.00</TRNAMT>
            <FITID>NU-DATA-IMPOSSIVEL</FITID>
            <MEMO>Data que nao existe</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`;

/** Buffer cp1252/latin1 do fixture SGML — é assim que o arquivo chega do banco. */
export function ofxSgmlLatin1Buffer(): Buffer {
  return Buffer.from(OFX_SGML_ITAU, 'latin1');
}
