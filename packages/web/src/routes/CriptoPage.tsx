import { BackToHomeLink } from '../components/BackToHomeLink';

/**
 * Rota `/investimentos/cripto` (T-004; era `/cripto` até a T-091a, que a
 * moveu para baixo do guarda-chuva de Investimentos — o path antigo redireciona
 * para cá): tela mock, sem funcionalidade — mascote 130px
 * centralizado + texto explicativo + botão de voltar, conforme
 * design_handoff README seção "Screens / Views > Cripto (mock)".
 */
export function CriptoPage() {
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
      <BackToHomeLink />
    </div>
  );
}
