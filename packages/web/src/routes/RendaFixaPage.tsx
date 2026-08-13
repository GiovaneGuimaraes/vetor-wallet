import { BackToHomeLink } from '../components/BackToHomeLink';

/**
 * Rota `/investimentos/renda-fixa` (T-091a): placeholder, mesmo padrão de
 * `CriptoPage`. Sem estado, sem fetch — caixinha/CDB/Tesouro (posição sem
 * ticker, valor aplicado, vencimento, taxa) são a fase (c) da T-091.
 *
 * Renda Fixa é IRMÃ de Ações dentro de Investimentos, não um pedaço dela
 * (decisão do humano, 2026-08-13). O mascote reusa `poupanca-t.png` de
 * propósito e temporariamente: a fase (a) não cria asset novo.
 */
export function RendaFixaPage() {
  return (
    <div className="vw-mock-page">
      <img
        src="/layers/poupanca-t.png"
        alt=""
        className="vw-mock-mascot"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
      <h1 className="vw-mock-title">Estamos trabalhando nisso</h1>
      <p className="vw-mock-text">
        A renda fixa ainda não está disponível. Em breve suas caixinhas, CDBs e títulos do Tesouro
        vão aparecer aqui, ao lado das suas ações — cada um com valor aplicado, taxa e vencimento.
      </p>
      <BackToHomeLink />
    </div>
  );
}
