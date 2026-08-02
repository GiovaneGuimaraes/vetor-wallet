import { useNavigate } from 'react-router-dom';

/**
 * T-083: Link discreto de volta para Home ("← Início") exibido no topo das
 * pages de layer. Reutilizável, respeitando o tema via CSS custom properties.
 * Usa useNavigate() para evitar recarga de página.
 */
export function BackToHomeLink() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/home')}
      className="vw-back-to-home-link"
      aria-label="Voltar para a página inicial"
    >
      ← Início
    </button>
  );
}
