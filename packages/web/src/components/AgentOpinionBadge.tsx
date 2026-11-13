import { useState } from 'react';
import type { AgentOpinion } from '../routes/diversificationInsights';
import { mascotSrcForLayer } from '../layout/mascots';
import './agentOpinionBadge.css';

/**
 * Ícone "Opinião do agente" no canto de um card (hub de Investimentos).
 * Clique abre um popover; fecha pelo "×" ou clicando o ícone de novo —
 * deliberadamente SEM hover, pra não disparar sozinho ao passar o mouse
 * pelo card inteiro (o próprio card já reage a hover/focus).
 *
 * `null` → não renderiza nada (nada relevante a dizer ainda).
 */
export function AgentOpinionBadge({ opinion }: { opinion: AgentOpinion | null }) {
  const [open, setOpen] = useState(false);
  if (!opinion) return null;

  return (
    <div className="vw-agent-badge">
      <button
        type="button"
        className={`vw-agent-badge-icon vw-agent-badge-icon--${opinion.level}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label="Opinião do agente VetorWallet"
        title="Opinião do agente"
      >
        <img
          src={mascotSrcForLayer('investimentos')}
          alt=""
          className="vw-agent-badge-mascot"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </button>

      {open && (
        <div
          className="vw-agent-badge-popover"
          role="dialog"
          aria-label="Opinião do agente VetorWallet"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="vw-agent-badge-popover-head">
            <span className="vw-agent-badge-popover-title">Opinião do agente</span>
            <button
              type="button"
              className="vw-agent-badge-close"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          <p className="vw-agent-badge-message">{opinion.message}</p>
        </div>
      )}
    </div>
  );
}
