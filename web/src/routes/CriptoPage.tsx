import { useNavigate } from 'react-router-dom';

/**
 * Rota `/cripto` (T-004): tela mock, sem funcionalidade — mascote 130px
 * centralizado + texto explicativo + botão de voltar, conforme
 * design_handoff README seção "Screens / Views > Cripto (mock)".
 */
export function CriptoPage() {
  const navigate = useNavigate();

  return (
    <div className="vw-mock-page">
      <img
        src="/layers/cripto-t.png"
        alt=""
        className="vw-mock-mascot"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
      <h1 className="vw-mock-title">Estamos trabalhando nisso</h1>
      <p className="vw-mock-text">
        O acompanhamento de criptomoedas ainda não está disponível. Em breve você vai poder
        acompanhar suas posições em cripto aqui, do mesmo jeito que já faz com suas ações.
      </p>
      <button type="button" onClick={() => navigate('/home')} className="vw-gbtn" style={{ width: 'auto', height: 'auto', padding: '8px 18px', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
        Voltar ao início
      </button>
    </div>
  );
}
