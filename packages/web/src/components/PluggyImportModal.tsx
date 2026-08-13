import { useEffect, useRef, useState } from 'react';
import type { PluggyImportMode, PluggyItemView, PluggySyncResponse } from '@vetor-wallet/shared';
import { createPluggyConnectToken, linkPluggyItem, syncPluggy, unlinkPluggyItem } from '../api';
import {
  PLUGGY_CONNECTOR_IDS,
  PLUGGY_CONNECT_SCRIPT,
  REPLACE_CONFIRM_WORD,
  canConfirmReplace,
  formatPluggyCounts,
  groupPluggyTransactions,
  importButtonLabel,
  internalMovementNote,
  replaceWarnings,
} from '../routes/pluggyImport';
import './pluggyImport.css';

/**
 * Modal de importação do Open Finance (T-089c).
 *
 * O componente **renderiza e orquestra chamadas**; toda decisão testável (texto
 * de aviso, regra de confirmação, agrupamento e contagem do relatório) vive em
 * `routes/pluggyImport.ts`, conforme a convenção do projeto.
 *
 * Fluxo: conectar banco (widget da Pluggy) → escolher modo → importar → ler o
 * relatório. Um usuário que já tem conexão cai direto na escolha de modo.
 */

interface PluggyConnectInstance {
  init: () => void;
  destroy?: () => void;
}

declare global {
  interface Window {
    PluggyConnect?: new (options: Record<string, unknown>) => PluggyConnectInstance;
  }
}

/**
 * Carrega o script do widget uma única vez por sessão de página.
 *
 * O `<script>` fica fora do bundle de propósito: é código de terceiro que a
 * Pluggy versiona por conta própria, e embuti-lo congelaria a versão do widget
 * num deploy nosso. A promessa é memoizada para que abrir o modal duas vezes não
 * injete duas tags.
 */
let scriptPromise: Promise<void> | null = null;

function loadPluggyScript(): Promise<void> {
  if (window.PluggyConnect) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = PLUGGY_CONNECT_SCRIPT;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => {
      // Zera a memoização: uma queda de rede não pode deixar o modal
      // permanentemente incapaz de tentar de novo.
      scriptPromise = null;
      reject(new Error('Não foi possível carregar o conector da Pluggy'));
    };
    document.head.appendChild(tag);
  });
  return scriptPromise;
}

interface Props {
  items: PluggyItemView[];
  onClose: () => void;
  /** Chamado após uma importação que gravou algo — a Home recarrega os totais. */
  onImported: () => void;
  /** Chamado quando a lista de conexões muda (conectou/desconectou). */
  onItemsChanged: () => void;
}

type Phase = 'idle' | 'connecting' | 'importing' | 'done';

export function PluggyImportModal({ items, onClose, onImported, onItemsChanged }: Props) {
  const [mode, setMode] = useState<PluggyImportMode>('append');
  const [confirmText, setConfirmText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PluggySyncResponse | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc fecha — menos durante uma importação, que não dá para cancelar pela
  // metade: o modo replace já pode ter apagado, e sumir com a tela nesse
  // instante esconderia justamente o relatório do que aconteceu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'importing') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Trocar de modo zera a confirmação: um "APAGAR" digitado, seguido de uma ida
  // e volta ao modo append, não pode continuar valendo.
  useEffect(() => {
    setConfirmText('');
  }, [mode]);

  async function handleConnect() {
    setError(null);
    setPhase('connecting');
    try {
      await loadPluggyScript();
      const connectToken = await createPluggyConnectToken();
      if (!window.PluggyConnect) throw new Error('Conector da Pluggy indisponível');

      const widget = new window.PluggyConnect({
        connectToken,
        connectorIds: PLUGGY_CONNECTOR_IDS,
        includeSandbox: false,
        onSuccess: async (data: {
          item?: { id?: string; connector?: { id?: number; name?: string }; status?: string };
        }) => {
          const item = data?.item;
          if (!item?.id) {
            setError('A Pluggy não devolveu o identificador da conexão');
            setPhase('idle');
            return;
          }
          try {
            await linkPluggyItem({
              itemId: item.id,
              connectorId: item.connector?.id ?? null,
              connectorName: item.connector?.name ?? null,
              status: item.status ?? null,
            });
            onItemsChanged();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao registrar a conexão');
          } finally {
            setPhase('idle');
          }
        },
        onError: () => {
          setError('A conexão com o banco não foi concluída');
          setPhase('idle');
        },
        onClose: () => setPhase('idle'),
      });
      widget.init();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir o conector');
      setPhase('idle');
    }
  }

  async function handleDisconnect(itemId: string) {
    setError(null);
    try {
      await unlinkPluggyItem(itemId);
      onItemsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desconectar');
    }
  }

  async function handleImport() {
    if (mode === 'replace' && !canConfirmReplace(confirmText)) return;
    setError(null);
    setPhase('importing');
    try {
      const result = await syncPluggy({ mode });
      setReport(result);
      setPhase('done');
      if (result.totals.imported > 0 || result.wiped) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar');
      setPhase('idle');
    }
  }

  const hasItems = items.length > 0;
  const replaceBlocked = mode === 'replace' && !canConfirmReplace(confirmText);

  return (
    <div className="vw-modal-backdrop" onClick={() => phase !== 'importing' && onClose()}>
      <div
        className="vw-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vw-pluggy-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vw-modal-head">
          <h2 id="vw-pluggy-title">Importar do banco</h2>
          <button
            type="button"
            className="vw-modal-close"
            onClick={onClose}
            disabled={phase === 'importing'}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {report ? (
          <div className="vw-modal-body">
            <p className="vw-pluggy-summary">{formatPluggyCounts(report.totals)}</p>
            {report.wiped && (
              <p className="vw-pluggy-wiped">
                Apagados antes de importar: {report.wiped.incomeEntries} de renda,{' '}
                {report.wiped.expenseEntries} de despesa e {report.wiped.savingsEntries} de
                poupança.
              </p>
            )}
            {internalMovementNote(report.totals) && (
              <p className="vw-pluggy-note">{internalMovementNote(report.totals)}</p>
            )}
            {report.errors.length > 0 && (
              <ul className="vw-pluggy-errors">
                {report.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            {groupPluggyTransactions(report.transactions).map((group) => (
              <details key={group.status} className="vw-pluggy-group">
                <summary>
                  {group.lines.length} {group.label}
                  {group.lines.length === 1 ? '' : 's'}
                </summary>
                <ul>
                  {group.lines.map((line, i) => (
                    <li key={`${line.transactionId ?? i}`}>
                      <span className="vw-pluggy-line-date">{line.date ?? '—'}</span>
                      <span className="vw-pluggy-line-desc">
                        {line.description ?? line.transactionId ?? '(sem descrição)'}
                      </span>
                      {line.reason && <span className="vw-pluggy-line-reason">{line.reason}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <div className="vw-modal-actions">
              <button type="button" className="vw-btn-primary" onClick={onClose}>
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <div className="vw-modal-body">
            <section className="vw-pluggy-section">
              <h3>Bancos conectados</h3>
              {hasItems ? (
                <ul className="vw-pluggy-items">
                  {items.map((item) => (
                    <li key={item.itemId}>
                      <span>{item.connectorName ?? 'Instituição'}</span>
                      <span className="vw-pluggy-item-status">{item.status}</span>
                      <button
                        type="button"
                        className="vw-btn-ghost"
                        onClick={() => handleDisconnect(item.itemId)}
                        disabled={phase === 'importing'}
                      >
                        Desconectar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="vw-pluggy-empty">
                  Nenhum banco conectado ainda. Conecte para trazer seus lançamentos
                  automaticamente.
                </p>
              )}
              <button
                type="button"
                className="vw-btn-ghost"
                onClick={handleConnect}
                disabled={phase !== 'idle'}
              >
                {phase === 'connecting' ? 'Abrindo…' : '+ Conectar banco'}
              </button>
            </section>

            <section className="vw-pluggy-section">
              <h3>Como importar</h3>
              <label className="vw-pluggy-mode">
                <input
                  type="radio"
                  name="pluggy-mode"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                />
                <span>
                  <strong>Somar aos meus dados</strong>
                  <small>
                    Mantém tudo o que já existe e acrescenta o que for novo. Transação já importada
                    não duplica.
                  </small>
                </span>
              </label>
              <label className="vw-pluggy-mode vw-pluggy-mode--danger">
                <input
                  type="radio"
                  name="pluggy-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                <span>
                  <strong>Substituir tudo pelos dados do banco</strong>
                  <small>Apaga o que existe antes de importar. Não tem volta.</small>
                </span>
              </label>

              {mode === 'replace' && (
                <div className="vw-pluggy-danger" role="alert">
                  <ul>
                    {replaceWarnings().map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <label className="vw-pluggy-confirm">
                    Para confirmar, digite <strong>{REPLACE_CONFIRM_WORD}</strong>:
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      autoComplete="off"
                      aria-label={`Digite ${REPLACE_CONFIRM_WORD} para confirmar`}
                    />
                  </label>
                </div>
              )}
            </section>

            {error && <p className="vw-pluggy-error">{error}</p>}

            <div className="vw-modal-actions">
              <button
                type="button"
                className="vw-btn-ghost"
                onClick={onClose}
                disabled={phase === 'importing'}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={mode === 'replace' ? 'vw-btn-danger' : 'vw-btn-primary'}
                onClick={handleImport}
                disabled={!hasItems || phase === 'importing' || replaceBlocked}
              >
                {phase === 'importing' ? 'Importando…' : importButtonLabel(mode)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
