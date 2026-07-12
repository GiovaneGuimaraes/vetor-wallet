import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import type { NewOperation, OperationType, CsvImportResult } from '@vetor-wallet/shared';
import { importCsv } from '../api';

interface CsvPreviewRow {
  line: number;
  raw: string;
  op: NewOperation | null;
  error: string | null;
}

function parseCsv(text: string): CsvPreviewRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: CsvPreviewRow[] = [];
  const start = lines.length > 0 && /ticker/i.test(lines[0]) ? 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const cols = raw.split(',').map((c) => c.trim());

    if (cols.length !== 5) {
      rows.push({ line: lineNum, raw, op: null, error: `esperado 5 colunas, encontrado ${cols.length}` });
      continue;
    }

    const [ticker, typeRaw, quantityStr, priceStr, date] = cols;
    const type = typeRaw.toUpperCase();
    const errs: string[] = [];

    if (!ticker || !/^[A-Za-z0-9]{1,10}$/.test(ticker)) errs.push('ticker inválido');
    if (type !== 'BUY' && type !== 'SELL') errs.push('tipo deve ser BUY ou SELL');
    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity) || quantity <= 0) errs.push('quantidade inválida');
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) errs.push('preço inválido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.push('data inválida (use YYYY-MM-DD)');

    if (errs.length > 0) {
      rows.push({ line: lineNum, raw, op: null, error: errs.join('; ') });
    } else {
      rows.push({
        line: lineNum,
        raw,
        op: { ticker: ticker.toUpperCase(), type: type as OperationType, quantity, price, date },
        error: null,
      });
    }
  }

  return rows;
}

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  onSuccess: () => Promise<void>;
}

export function CsvImport({ onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<CsvPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRows(csvText.trim() ? parseCsv(csvText) : []);
    setResult(null);
    setImportError('');
  }, [csvText]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(reader.result as string);
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  async function handleConfirm() {
    setImporting(true);
    setImportError('');
    try {
      const res = await importCsv(csvText);
      setResult(res);
      if (res.imported > 0) await onSuccess();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao importar');
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setCsvText('');
    setRows([]);
    setResult(null);
    setImportError('');
  }

  const validCount = rows.filter((r) => r.op !== null).length;
  const errorCount = rows.filter((r) => r.error !== null).length;

  const card = 'bg-card border border-edge rounded-xl p-5 md:p-6';
  const btn =
    'text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  if (!open) {
    return (
      <div className={card}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Importar CSV</h2>
            <p className="text-xs text-dim mt-0.5">Cadastre múltiplas operações de uma vez</p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className={`${btn} bg-surface border border-edge text-ink hover:border-accent hover:text-accent`}
          >
            Selecionar arquivo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-ink">Importar CSV</h2>
        <button onClick={handleClose} className="text-dim hover:text-ink text-lg leading-none cursor-pointer">
          ×
        </button>
      </div>

      {!result && (
        <>
          <div className="mb-4 p-3 bg-surface border border-edge rounded-lg text-xs text-dim font-mono leading-relaxed">
            <span className="text-ink font-semibold not-italic">Formato:</span> ticker,tipo,quantidade,preço,data
            <br />
            <span className="text-ink font-semibold not-italic">Exemplo:</span> PETR4,BUY,100,38.50,2024-01-15
            <br />
            Tipo: <span className="text-ink">BUY</span> ou <span className="text-ink">SELL</span> — Data: <span className="text-ink">YYYY-MM-DD</span>
          </div>

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => fileRef.current?.click()}
              className={`${btn} bg-surface border border-edge text-ink hover:border-accent hover:text-accent`}
            >
              Escolher arquivo .csv
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/plain" className="hidden" onChange={handleFileChange} />
            <span className="text-xs text-dim self-center">ou cole o conteúdo abaixo</span>
          </div>

          <textarea
            className="w-full h-28 bg-canvas border border-edge rounded-lg px-3 py-2 text-xs font-mono text-ink placeholder:text-dim/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors resize-none mb-4"
            placeholder={'ticker,tipo,quantidade,preço,data\nPETR4,BUY,100,38.50,2024-01-15\nVALE3,SELL,50,90.20,2024-02-01'}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />

          {rows.length > 0 && (
            <>
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-dim uppercase tracking-wide">
                      <th className="text-left py-1.5 pr-4">Linha</th>
                      <th className="text-left py-1.5 pr-4">Ticker</th>
                      <th className="text-left py-1.5 pr-4">Tipo</th>
                      <th className="text-right py-1.5 pr-4">Qtd</th>
                      <th className="text-right py-1.5 pr-4">Preço</th>
                      <th className="text-left py-1.5 pr-4">Data</th>
                      <th className="text-left py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.line} className="border-t border-edge/40">
                        <td className="py-1.5 pr-4 text-dim">{row.line}</td>
                        {row.op ? (
                          <>
                            <td className="py-1.5 pr-4 font-medium text-ink">{row.op.ticker}</td>
                            <td className={`py-1.5 pr-4 ${row.op.type === 'BUY' ? 'text-up' : 'text-down'}`}>
                              {row.op.type === 'BUY' ? 'Compra' : 'Venda'}
                            </td>
                            <td className="py-1.5 pr-4 text-right text-ink">{row.op.quantity}</td>
                            <td className="py-1.5 pr-4 text-right text-ink">R$ {fmt.format(row.op.price)}</td>
                            <td className="py-1.5 pr-4 text-dim">{row.op.date}</td>
                            <td className="py-1.5 text-up font-bold">✓</td>
                          </>
                        ) : (
                          <>
                            <td colSpan={5} className="py-1.5 pr-4 text-down truncate max-w-xs" title={row.error ?? ''}>
                              {row.error}
                            </td>
                            <td className="py-1.5 text-down font-bold">✗</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-dim mb-4">
                {validCount > 0 && (
                  <span className="text-up font-medium">{validCount} válida{validCount !== 1 ? 's' : ''}</span>
                )}
                {validCount > 0 && errorCount > 0 && <span> · </span>}
                {errorCount > 0 && (
                  <span className="text-down font-medium">{errorCount} com erro</span>
                )}
              </p>
            </>
          )}

          {importError && (
            <div className="mb-4 text-sm text-down bg-down/10 border border-down/25 rounded-lg px-3 py-2">
              {importError}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button onClick={handleClose} className={`${btn} bg-surface border border-edge text-ink hover:border-edge`}>
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={importing || validCount === 0}
              className={`${btn} bg-accent hover:bg-accent-hover text-white`}
            >
              {importing
                ? 'Importando...'
                : `Importar ${validCount} operaç${validCount !== 1 ? 'ões' : 'ão'}`}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="text-center py-4">
          {result.imported > 0 && (
            <p className="text-up font-medium text-sm mb-2">
              ✓ {result.imported} operaç{result.imported !== 1 ? 'ões importadas' : 'ão importada'} com sucesso
            </p>
          )}
          {result.unknownTickers && result.unknownTickers.length > 0 && (
            <div className="text-left mb-4 bg-warn/10 border border-warn/30 rounded-lg px-3 py-2.5">
              <p className="text-xs font-semibold text-warn uppercase tracking-wide mb-1">Tickers não reconhecidos</p>
              <p className="text-xs text-ink">
                {result.unknownTickers.join(', ')} — importados, mas não estão na lista da brapi.dev. Verifique se os tickers estão corretos.
              </p>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="text-left mb-4">
              <p className="text-xs text-dim mb-2 uppercase tracking-wide">
                {result.errors.length} linha{result.errors.length !== 1 ? 's ignoradas' : ' ignorada'} por erro:
              </p>
              <ul className="space-y-1">
                {result.errors.map((e) => (
                  <li key={e.line} className="text-xs text-down">
                    Linha {e.line}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={handleClose} className={`${btn} bg-surface border border-edge text-ink hover:border-accent`}>
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
