import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WalletSelector } from '../components/WalletSelector';
import { useShellContext } from '../layout/ShellContext';
import { decideWalletFlow } from './walletFlow';

const RETRY_BTN_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--btn-1), var(--btn-2))',
  color: 'var(--btn-ink)',
  border: 0,
  borderRadius: '10px',
  padding: '9px 18px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

/**
 * Rota `/carteiras` (T-004, simplificada na T-027 — "modo carteira única",
 * decisão do humano em 2026-07-24: "uma carteira só resolve — não precisa da
 * page de várias carteiras"). A decisão de criar/redirecionar/listar/mostrar
 * erro é pura (`decideWalletFlow`, testada em `walletFlow.test.ts`); esta
 * página só interpreta o resultado:
 *
 * - `walletsLoadError` (a última busca de `/api/wallets` falhou) e
 *   `wallets` vazio → estado de erro com retry (chama `refreshWallets`).
 *   **Nunca** cria a "Principal" automaticamente nesse caso — uma falha
 *   transitória de rede não pode mascarar carteiras reais do usuário atrás
 *   de uma carteira espúria (achado bloqueante do revisor na 1ª rodada).
 * - 0 carteiras (sem erro de carga) → cria a "Principal" automaticamente via
 *   `POST /api/wallets` (rota já existente, sem mudança no server) e, assim
 *   que `wallets` for atualizado pelo `ShellContext`, a decisão vira
 *   `redirect` sozinha.
 * - 1 carteira → redireciona direto para `/dash/:id`, a menos que a URL
 *   tenha `?manage=1` (caminho preservado para criar uma segunda carteira
 *   sem cair num loop de redirect — acessível a partir do botão "Trocar
 *   carteira" do dashboard quando só existe 1 carteira).
 * - 2+ carteiras (dados legados) → grid de sempre, comportamento inalterado.
 */
export function CarteirasPage() {
  const {
    user,
    wallets,
    walletsLoaded,
    walletsLoadError,
    walletSummaries,
    onSelectWallet,
    onCreateWallet,
    refreshWallets,
    theme,
  } = useShellContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const forceList = searchParams.get('manage') === '1';

  const creatingRef = useRef(false);
  const [autoCreateError, setAutoCreateError] = useState<string | null>(null);

  // Única implementação da criação automática da "Principal" — usada tanto
  // pelo efeito de decisão quanto pelo botão "Tentar novamente" (antes
  // duplicada entre os dois; extraída após sugestão do revisor).
  const runAutoCreate = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setAutoCreateError(null);
    onCreateWallet({ name: 'Principal', description: '', color: '#e3d5b8' })
      .catch((err) => {
        setAutoCreateError(err instanceof Error ? err.message : 'Erro ao criar sua carteira automaticamente');
      })
      .finally(() => {
        creatingRef.current = false;
      });
  }, [onCreateWallet]);

  useEffect(() => {
    if (!walletsLoaded) return; // ainda não sabemos a contagem real — não decide nada ainda

    const decision = decideWalletFlow(wallets, forceList, walletsLoadError);

    if (decision.action === 'redirect') {
      navigate(`/dash/${decision.walletId}`, { replace: true });
      return;
    }

    if (decision.action === 'create') {
      runAutoCreate();
    }
  }, [walletsLoaded, walletsLoadError, wallets, forceList, navigate, runAutoCreate]);

  if (!walletsLoaded) {
    return <p style={{ padding: '32px', color: 'var(--color-dim)', fontSize: '14px' }}>Carregando suas carteiras…</p>;
  }

  const decision = decideWalletFlow(wallets, forceList, walletsLoadError);

  if (decision.action === 'error') {
    return (
      <div style={{ padding: '32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#f43f5e' }}>
            Não foi possível carregar suas carteiras. Verifique sua conexão e tente novamente.
          </p>
          <button type="button" onClick={() => { void refreshWallets(); }} style={RETRY_BTN_STYLE}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (decision.action === 'create') {
    return (
      <div style={{ padding: '32px' }}>
        {autoCreateError ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#f43f5e' }}>
              Não foi possível criar sua carteira automaticamente: {autoCreateError}
            </p>
            <button type="button" onClick={runAutoCreate} style={RETRY_BTN_STYLE}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <p style={{ color: 'var(--color-dim)', fontSize: '14px' }}>Preparando sua carteira…</p>
        )}
      </div>
    );
  }

  if (decision.action === 'redirect') {
    // O navigate() já foi disparado pelo efeito acima; evita piscar a lista
    // enquanto o router processa a troca de rota.
    return <p style={{ padding: '32px', color: 'var(--color-dim)', fontSize: '14px' }}>Abrindo sua carteira…</p>;
  }

  return (
    <WalletSelector
      embedded
      user={user}
      wallets={wallets}
      walletSummaries={walletSummaries}
      onSelect={onSelectWallet}
      onCreateWallet={onCreateWallet}
      onLogout={() => {
        /* sair já fica no header do AppShell nesta rota */
      }}
      theme={theme}
      onToggle={() => {
        /* toggle já fica no header do AppShell nesta rota */
      }}
    />
  );
}
