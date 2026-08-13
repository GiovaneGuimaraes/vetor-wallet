import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PluggyImportMode, PluggyItemView, PluggySyncResponse } from '@vetor-wallet/shared';
import { createPluggyConnectToken, linkPluggyItem, syncPluggy, unlinkPluggyItem } from '../api';
import {
  PLUGGY_BRAND,
  PLUGGY_CONNECTOR_IDS,
  PLUGGY_CONNECT_SCRIPT,
  REPLACE_CONFIRM_WORD,
  connectionSummary,
  formatPluggyCounts,
  groupPluggyTransactions,
  importButtonLabel,
  importDisabledReason,
  internalMovementNote,
  pluggySecurityNotes,
  replaceWarnings,
  statusTone,
} from '../routes/pluggyImport';
import './pluggyImport.css';

/**
 * Modal de importação do Open Finance (T-089c, UX refeita na T-089f).
 *
 * O componente **renderiza e orquestra chamadas**; toda decisão testável (texto
 * de aviso, regra de confirmação, motivo do botão travado, agrupamento e
 * contagem do relatório) vive em `routes/pluggyImport.ts`, conforme a convenção
 * do projeto.
 *
 * Fluxo: conectar banco (widget da Pluggy) → escolher modo → importar → ler o
 * relatório. Quem já tem conexão cai direto na escolha de modo.
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
 * Pluggy versiona por conta própria, e embuti-lo congelaria a versão num deploy
 * nosso. A promessa é memoizada para que abrir o modal duas vezes não injete
 * duas tags.
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

/** Selo da marca da Pluggy — o JPG tem fundo escuro próprio, então o selo usa
 *  a mesma cor e `overflow:hidden`: sem costura visível no tema claro. */
function PluggyBadge({ size = 28 }: { size?: number }) {
  return (
    <span
      className="vw-pluggy-badge"
      style={{ width: size, height: size, background: PLUGGY_BRAND.logoBackdrop }}
    >
      <img src={PLUGGY_BRAND.logo} alt="" width={size} height={size} />
    </span>
  );
}

interface Props {
  items: PluggyItemView[];
  onClose: () => void;
  /** Chamado após uma importação que gravou (ou apagou) algo. */
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
  const [removing, setRemoving] = useState<string | null>(null);
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

  const hasItems = items.length > 0;
  const blockedReason = importDisabledReason({ hasItems, mode, confirmText });

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
    setRemoving(itemId);
    try {
      await unlinkPluggyItem(itemId);
      onItemsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desconectar');
    } finally {
      setRemoving(null);
    }
  }

  async function handleImport() {
    if (blockedReason) return;
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

  /**
   * **Portal para o `body`, e isso não é preferência de estilo.**
   *
   * O modal é filho de `.vw-main`, que carrega `transform` da animação de
   * entrada (`vw-rise`). Um `transform` cria containing block **e** stacking
   * context: dentro dele, `position: fixed` passa a se ancorar em `.vw-main` em
   * vez da viewport, e o `z-index: 100` do backdrop só compete lá dentro — de
   * modo que o header sticky do app (`z-index: 40`, no contexto raiz) pintava
   * por cima do cabeçalho do modal. Foi visto na tela, não deduzido.
   *
   * Portal tira o modal da árvore transformada e devolve os dois
   * comportamentos. Qualquer modal futuro precisa do mesmo tratamento enquanto
   * `.vw-main` tiver transform.
   */
  return createPortal(
    <div
      className="vw-modal-backdrop"
      onClick={() => phase !== 'importing' && onClose()}
      role="presentation"
    >
      <div
        className="vw-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vw-pluggy-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="vw-modal-head">
          <div className="vw-modal-head-main">
            <PluggyBadge size={36} />
            <div>
              <h2 id="vw-pluggy-title">Importar do banco</h2>
              <p className="vw-modal-head-sub">
                Open Finance via <strong>{PLUGGY_BRAND.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="vw-modal-close"
            onClick={onClose}
            disabled={phase === 'importing'}
            aria-label="Fechar"
          >
            ×
          </button>
        </header>

        {report ? (
          <>
            <div className="vw-modal-body">
              <div className="vw-pluggy-result">
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
              </div>

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
                    <span className={`vw-pluggy-dot vw-pluggy-dot--${statusTone(group.status)}`} />
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
                        {line.amount !== undefined && (
                          <span className="vw-pluggy-line-amount">
                            {line.amount.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {group.lines.some((l) => l.reason) && (
                    <p className="vw-pluggy-group-reason">
                      {group.lines.find((l) => l.reason)?.reason}
                    </p>
                  )}
                </details>
              ))}
            </div>
            <footer className="vw-modal-foot">
              <div className="vw-modal-foot-actions">
                <button type="button" className="vw-btn vw-btn-primary" onClick={onClose}>
                  Concluir
                </button>
              </div>
            </footer>
          </>
        ) : (
          <>
            <div className="vw-modal-body">
              <section className="vw-pluggy-section">
                <div className="vw-pluggy-section-head">
                  <h3>Bancos conectados</h3>
                  <span className="vw-pluggy-count">{connectionSummary(items.length)}</span>
                </div>

                {hasItems ? (
                  <ul className="vw-pluggy-items">
                    {items.map((item) => (
                      <li key={item.itemId}>
                        <PluggyBadge size={24} />
                        <span className="vw-pluggy-item-name">
                          {item.connectorName ?? 'Instituição'}
                        </span>
                        <span className="vw-pluggy-item-status">{item.status}</span>
                        <button
                          type="button"
                          className="vw-btn vw-btn-ghost vw-btn-sm"
                          onClick={() => handleDisconnect(item.itemId)}
                          disabled={phase === 'importing' || removing === item.itemId}
                        >
                          {removing === item.itemId ? 'Removendo…' : 'Desconectar'}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="vw-pluggy-empty">
                    <p className="vw-pluggy-empty-title">Traga seus lançamentos direto do banco</p>
                    <ul className="vw-pluggy-security">
                      {pluggySecurityNotes().map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  className="vw-btn vw-btn-ghost vw-pluggy-connect"
                  onClick={handleConnect}
                  disabled={phase !== 'idle'}
                >
                  {phase === 'connecting' ? 'Abrindo a Pluggy…' : '+ Conectar banco'}
                </button>
              </section>

              <section className="vw-pluggy-section">
                <div className="vw-pluggy-section-head">
                  <h3>Como importar</h3>
                </div>

                <div className="vw-pluggy-modes">
                  <label className={`vw-pluggy-mode${mode === 'append' ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="pluggy-mode"
                      checked={mode === 'append'}
                      onChange={() => setMode('append')}
                    />
                    <span className="vw-pluggy-mode-text">
                      <strong>Somar aos meus dados</strong>
                      <small>
                        Mantém tudo o que já existe e acrescenta o que for novo. Transação já
                        importada não duplica.
                      </small>
                    </span>
                  </label>

                  <label
                    className={`vw-pluggy-mode vw-pluggy-mode--danger${
                      mode === 'replace' ? ' is-selected' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="pluggy-mode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                    />
                    <span className="vw-pluggy-mode-text">
                      <strong>Substituir tudo pelos dados do banco</strong>
                      <small>Apaga o que existe antes de importar. Não tem volta.</small>
                    </span>
                  </label>
                </div>

                {mode === 'replace' && (
                  <div className="vw-pluggy-danger" role="alert">
                    <p className="vw-pluggy-danger-title">Antes de confirmar, leia:</p>
                    <ul>
                      {replaceWarnings().map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                    <label className="vw-pluggy-confirm">
                      <span>
                        Digite <strong>{REPLACE_CONFIRM_WORD}</strong> para confirmar
                      </span>
                      <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        autoComplete="off"
                        placeholder={REPLACE_CONFIRM_WORD}
                        aria-label={`Digite ${REPLACE_CONFIRM_WORD} para confirmar`}
                      />
                    </label>
                  </div>
                )}
              </section>

              {error && (
                <p className="vw-pluggy-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            <footer className="vw-modal-foot">
              {/* Botão travado SEMPRE diz por quê — `disabled` mudo é beco sem saída. */}
              {blockedReason && <span className="vw-pluggy-blocked">{blockedReason}</span>}
              <div className="vw-modal-foot-actions">
                <button
                  type="button"
                  className="vw-btn vw-btn-ghost"
                  onClick={onClose}
                  disabled={phase === 'importing'}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={`vw-btn ${mode === 'replace' ? 'vw-btn-danger' : 'vw-btn-primary'}`}
                  onClick={handleImport}
                  disabled={phase === 'importing' || blockedReason !== null}
                >
                  {phase === 'importing' ? 'Importando…' : importButtonLabel(mode)}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
