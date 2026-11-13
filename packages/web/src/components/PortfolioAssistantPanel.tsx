import { useState } from 'react';
import type { DiversificationInput } from '../routes/diversificationInsights';
import { answerPortfolioQuestion, PORTFOLIO_QUESTIONS } from '../routes/portfolioAssistant';
import { mascotSrcForLayer } from '../layout/mascots';
import './portfolioAssistant.css';

interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  text: string;
}

const GREETING =
  'Oi! Eu sou o agente VetorWallet. Escolha uma pergunta abaixo — minhas respostas são ' +
  'regras fixas em cima da sua carteira, nunca uma recomendação de compra ou venda.';

/**
 * Painel "Agente VetorWallet" em `/investimentos`: em vez de um campo de
 * texto livre (que pareceria um chat com IA de verdade), o usuário só pode
 * clicar numa pergunta de `PORTFOLIO_QUESTIONS` — a resposta é texto gerado
 * por regra (`portfolioAssistant.ts`), sem LLM. Só este componente tem
 * estado (a transcrição e se o painel está aberto); a lógica de negócio
 * inteira está nos módulos puros que ele chama.
 */
export function PortfolioAssistantPanel({ input }: { input: DiversificationInput }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 'greeting', role: 'bot', text: GREETING }]);

  function ask(questionId: (typeof PORTFOLIO_QUESTIONS)[number]['id'], label: string) {
    const answer = answerPortfolioQuestion(questionId, input);
    setMessages((prev) => [
      ...prev,
      { id: `${questionId}-${prev.length}-q`, role: 'user', text: label },
      { id: `${questionId}-${prev.length}-a`, role: 'bot', text: answer },
    ]);
  }

  return (
    <>
      <button
        type="button"
        className="vw-assistant-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Fechar assistente VetorWallet' : 'Abrir assistente VetorWallet'}
      >
        <img
          src={mascotSrcForLayer('investimentos')}
          alt=""
          className="vw-assistant-toggle-mascot"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        {!open && <span className="vw-assistant-toggle-label">Agente VetorWallet</span>}
      </button>

      {open && (
        <aside className="vw-assistant-panel" aria-label="Agente VetorWallet">
          <div className="vw-assistant-header">
            <p className="vw-assistant-title">Agente VetorWallet</p>
            <button
              type="button"
              className="vw-modal-close"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          <div className="vw-assistant-messages">
            {messages.map((m) => (
              <p key={m.id} className={`vw-assistant-bubble vw-assistant-bubble--${m.role}`}>
                {m.text}
              </p>
            ))}
          </div>

          <div className="vw-assistant-questions">
            {PORTFOLIO_QUESTIONS.map((q) => (
              <button
                key={q.id}
                type="button"
                className="vw-assistant-question"
                onClick={() => ask(q.id, q.label)}
              >
                {q.label}
              </button>
            ))}
          </div>
        </aside>
      )}
    </>
  );
}
