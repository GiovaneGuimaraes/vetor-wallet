import type { DiversificationTip } from '../routes/diversificationInsights';
import { mascotSrcForLayer } from '../layout/mascots';

/**
 * Card "Sugestão do agente VetorWallet" em `/investimentos` (hub). Só
 * renderiza — a lógica de quais tips aparecem vive em
 * `routes/diversificationInsights.ts` (regras fixas em código, sem IA/LLM).
 */
export function DiversificationTipsCard({ tips }: { tips: DiversificationTip[] }) {
  if (tips.length === 0) return null;

  return (
    <div className="vw-divtips">
      <div className="vw-divtips-header">
        <img
          src={mascotSrcForLayer('investimentos')}
          alt=""
          className="vw-divtips-mascot"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <div>
          <p className="vw-divtips-title">Sugestão do agente VetorWallet</p>
          <p className="vw-divtips-subtitle">
            Observações automáticas sobre a distribuição da sua carteira — informativo, nunca uma
            recomendação de compra ou venda.
          </p>
        </div>
      </div>
      <ul className="vw-divtips-list">
        {tips.map((tip) => (
          <li key={tip.id} className={`vw-divtips-item vw-divtips-item--${tip.level}`}>
            <p className="vw-divtips-item-title">{tip.title}</p>
            <p className="vw-divtips-item-message">{tip.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
