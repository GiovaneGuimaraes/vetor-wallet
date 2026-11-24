import { useNavigate } from 'react-router-dom';

interface BackLinkProps {
  /** Destino do voltar (path da rota). */
  to: string;
  /** Texto visível, ex.: "← Investimentos". */
  label: string;
  ariaLabel: string;
}

/**
 * Voltar genérico, com o mesmo visual do `BackToHomeLink`. Existe para as
 * subpages de Investimentos (Ações, Cripto, Renda Fixa), cujo "pai" é o hub
 * `/investimentos` e não a Home.
 */
export function BackLink({ to, label, ariaLabel }: BackLinkProps) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="vw-back-to-home-link"
      aria-label={ariaLabel}
    >
      {label}
    </button>
  );
}

/** Voltar das subpages de Investimentos para o hub `/investimentos`. */
export function BackToInvestimentosLink() {
  return (
    <BackLink to="/investimentos" label="← Investimentos" ariaLabel="Voltar para Investimentos" />
  );
}
