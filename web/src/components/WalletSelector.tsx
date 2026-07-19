import { useState, type FormEvent } from 'react';
import type { User, Wallet, PortfolioSummary, NewWallet } from '@vetor-wallet/shared';

const WALLET_PALETTE = ['#e3d5b8', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4'];

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%';

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hexToRgb(hex: string): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '227, 213, 184';
  return `${r}, ${g}, ${b}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
      style={{
        width: '32px', height: '32px', border: '1px solid var(--color-edge)',
        borderRadius: '99px', background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-dim)', transition: 'color .2s, border-color .2s',
        padding: 0,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-ink)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-edge)'; }}
    >
      {theme === 'dark' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}

function WalletIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

interface WalletCardProps {
  wallet: Wallet;
  index: number;
  summary?: PortfolioSummary;
  onClick: () => void;
}

function WalletCard({ wallet, index, summary, onClick }: WalletCardProps) {
  const [hovered, setHovered] = useState(false);
  const color = wallet.color || WALLET_PALETTE[index % WALLET_PALETTE.length];
  const rgb = hexToRgb(color);
  const tiltActive = hovered && !prefersReducedMotion;

  const currentValue = summary?.totalCurrentValue ?? summary?.totalInvested ?? 0;
  const profitLossPct = summary?.totalProfitLossPct ?? 0;
  const nAtivos = summary?.positions.length ?? 0;
  const isProfit = profitLossPct >= 0;

  // Allocation bar segments
  const segments = (summary?.positions ?? [])
    .filter((p) => p.allocationPct != null && p.allocationPct! > 0)
    .map((p, i) => ({ pct: p.allocationPct!, color: WALLET_PALETTE[i % WALLET_PALETTE.length] }));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        aspectRatio: '1.6',
        borderRadius: '20px',
        padding: '22px',
        background: 'linear-gradient(145deg, var(--leather-1), var(--card-2))',
        border: hovered ? `1px solid rgba(${rgb}, 0.55)` : '1px solid var(--color-edge)',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        outline: 'none',
        transform: tiltActive
          ? 'perspective(700px) translateY(-6px) rotate3d(1, -0.6, 0, 4deg)'
          : 'none',
        boxShadow: hovered ? '0 20px 50px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.10)',
        transition: '.35s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {/* Radial colour tint */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 75% 20%, rgba(${rgb}, 0.14) 0%, transparent 60%)`, pointerEvents: 'none' }} />
      {/* Diagonal shine */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.07) 46%, transparent 58%)', pointerEvents: 'none' }} />

      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1, gap: '8px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {wallet.name}
          </p>
          {wallet.description && (
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {wallet.description}
            </p>
          )}
        </div>
        <WalletIcon color={color} />
      </div>

      {/* Metallic chip */}
      <div aria-hidden="true" style={{ marginTop: 'auto', width: '42px', height: '31px', borderRadius: '7px', background: 'linear-gradient(145deg, var(--btn-1), var(--btn-2))', position: 'relative', flexShrink: 0, zIndex: 1, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.22)' }}>
        <div style={{ position: 'absolute', inset: '6px 8px', border: '1px solid rgba(0,0,0,0.28)', borderRadius: '4px' }} />
      </div>

      {/* Total value */}
      <p style={{ margin: '8px 0 0', fontSize: '30px', fontWeight: 650, letterSpacing: '-0.01em', color: 'var(--color-ink)', textShadow: '0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.25)', lineHeight: 1, position: 'relative', zIndex: 1, fontVariantNumeric: 'tabular-nums' }}>
        {fmtCur.format(currentValue)}
      </p>

      {/* Bottom row: P&L pill + asset count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', marginBottom: '6px', position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: isProfit ? 'rgba(16,185,129,0.14)' : 'rgba(244,63,94,0.14)', color: isProfit ? '#10b981' : '#f43f5e', lineHeight: '18px' }}>
          {fmtPct(profitLossPct)}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--color-mid)', fontVariantNumeric: 'tabular-nums' }}>
          {nAtivos} {nAtivos === 1 ? 'ativo' : 'ativos'}
        </span>
      </div>

      {/* Allocation bar */}
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '5px', display: 'flex', borderRadius: '0 0 20px 20px', overflow: 'hidden' }}>
        {segments.length > 0
          ? segments.map((seg, i) => (
              <div key={i} style={{ width: `${seg.pct}%`, background: seg.color }} />
            ))
          : <div style={{ width: '100%', background: color, opacity: 0.4 }} />
        }
      </div>
    </div>
  );
}

function NewWalletCard({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minHeight: '220px',
        borderRadius: '20px',
        border: `1.5px dashed ${hovered ? 'var(--color-accent)' : 'var(--color-edge)'}`,
        background: hovered ? `rgba(var(--raised-rgb), 0.25)` : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        transition: 'border-color .25s, background .25s',
        outline: 'none',
      }}
    >
      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: `rgba(var(--raised-rgb), 0.8)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </div>
      <span style={{ fontSize: '14px', color: 'var(--color-mid)', fontWeight: 500 }}>Nova carteira</span>
    </div>
  );
}

// ── Create wallet modal ───────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreate: (data: NewWallet) => Promise<void>;
}

function CreateWalletModal({ onClose, onCreate }: CreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(WALLET_PALETTE[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Informe o nome da carteira'); return; }
    setLoading(true);
    setError('');
    try {
      await onCreate({ name: name.trim(), description: description.trim(), color });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar carteira');
    } finally {
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--color-canvas)', border: '1px solid var(--color-edge)',
    borderRadius: '10px', padding: '10px 12px', fontSize: '14px', color: 'var(--color-ink)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
    transition: 'border-color .2s, box-shadow .2s',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-dim)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '6px' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '100%', maxWidth: '400px', background: 'linear-gradient(180deg, var(--card-1), var(--card-2))', border: '1px solid var(--color-edge)', borderRadius: '16px', padding: '26px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-ink)' }}>Nova carteira</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-dim)', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }} aria-label="Fechar">×</button>
        </div>

        {error && (
          <div style={{ marginBottom: '16px', fontSize: '13px', color: '#f43f5e', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '8px', padding: '8px 12px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span style={lbl}>Nome</span>
            <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Carteira B3 pessoal" maxLength={60} autoFocus
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--color-accent)'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(var(--accent-rgb), .18)'; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--color-edge)'; (e.target as HTMLInputElement).style.boxShadow = 'none'; }}
            />
          </div>
          <div>
            <span style={lbl}>Descrição (opcional)</span>
            <input style={inp} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Ações · longo prazo" maxLength={120}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--color-accent)'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(var(--accent-rgb), .18)'; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--color-edge)'; (e.target as HTMLInputElement).style.boxShadow = 'none'; }}
            />
          </div>
          <div>
            <span style={lbl}>Cor</span>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {WALLET_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', background: c, border: color === c ? '2px solid var(--color-ink)' : '2px solid transparent', cursor: 'pointer', outline: 'none', boxShadow: color === c ? `0 0 0 3px rgba(${hexToRgb(c)}, 0.4)` : 'none', transition: 'box-shadow .2s, border-color .2s' }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={onClose} style={{ background: `rgba(var(--raised-rgb), 0.6)`, border: '1px solid var(--color-edge)', color: 'var(--color-ink)', borderRadius: '10px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} style={{ background: 'linear-gradient(135deg, var(--btn-1), var(--btn-2))', color: 'var(--btn-ink)', border: 0, borderRadius: '10px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'inherit', transition: 'transform .15s, box-shadow .2s' }}
              onMouseEnter={(e) => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(var(--accent-rgb),.35)'; } }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = ''; }}
            >
              {loading ? 'Criando...' : 'Criar carteira'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  user: User;
  wallets: Wallet[];
  walletSummaries: Record<number, PortfolioSummary>;
  onSelect: (wallet: Wallet) => void;
  onCreateWallet: (data: NewWallet) => Promise<void>;
  onLogout: () => void;
  theme: 'dark' | 'light';
  onToggle: () => void;
}

export function WalletSelector({ user, wallets, walletSummaries, onSelect, onCreateWallet, onLogout, theme, onToggle }: Props) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen bg-canvas" style={{ background: `radial-gradient(80% 50% at 50% -10%, rgba(var(--accent-rgb), .08), transparent 60%), var(--color-canvas)` }}>
      <header style={{ position: 'sticky', top: 0, height: '60px', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', background: 'var(--header-bg)', borderBottom: '1px solid rgba(var(--edge-rgb), 0.5)', zIndex: 50, display: 'flex', alignItems: 'center' }}>
        <div className="wallet-selector-header-inner" style={{ maxWidth: '1120px', width: '100%', margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em', background: 'linear-gradient(90deg, var(--color-accent-2), var(--color-accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Vetor Wallet
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <ThemeToggle theme={theme} onToggle={onToggle} />
            <span className="hidden sm:inline" style={{ fontSize: '12px', color: 'var(--color-dim)' }}>{user.email}</span>
            <button onClick={onLogout} style={{ background: 'none', border: 'none', color: 'var(--color-dim)', fontSize: '13px', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit', transition: 'color .2s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-ink)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-dim)'; }}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="wallet-selector-main" style={{ maxWidth: '1120px', margin: '0 auto', padding: '56px 32px 64px' }}>
        <div className="screen">
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-ink)' }}>Suas carteiras</h1>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--color-dim)' }}>Selecione uma carteira para acessar seu dashboard</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px', marginTop: '28px' }}>
          {wallets.map((wallet, index) => (
            <div key={wallet.id} className={`rise d${Math.min(index + 1, 5)}`}>
              <WalletCard wallet={wallet} index={index} summary={walletSummaries[wallet.id]} onClick={() => onSelect(wallet)} />
            </div>
          ))}
          <div className={`rise d${Math.min(wallets.length + 1, 5)}`}>
            <NewWalletCard onClick={() => setShowCreate(true)} />
          </div>
        </div>
      </main>

      {showCreate && (
        <CreateWalletModal
          onClose={() => setShowCreate(false)}
          onCreate={async (data) => { await onCreateWallet(data); setShowCreate(false); }}
        />
      )}
    </div>
  );
}
