import { useState } from 'react';
import type { User, Wallet } from '@vetor-wallet/shared';

// Palette used when a wallet has no explicit color set
const WALLET_PALETTE = ['#e3d5b8', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4'];

const fmtCur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Detect reduced-motion preference once at module load so it is stable
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hexToRgb(hex: string): string {
  const cleaned = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '255, 255, 255';
  return `${r}, ${g}, ${b}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  user: User;
  wallets: Wallet[];
  onSelect: (wallet: Wallet) => void;
  onCreateWallet: () => void;
  onLogout: () => void;
  theme: 'dark' | 'light';
  onToggle: () => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className="text-dim hover:text-ink transition-colors cursor-pointer bg-transparent border-0 flex items-center justify-center p-1.5 rounded-lg"
    >
      {theme === 'dark' ? (
        // Sun — shown in dark mode to switch to light
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // Moon — shown in light mode to switch to dark
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

function WalletIcon({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

interface WalletCardProps {
  wallet: Wallet;
  index: number;
  onClick: () => void;
}

function WalletCard({ wallet, index, onClick }: WalletCardProps) {
  const [hovered, setHovered] = useState(false);

  const color = wallet.color || WALLET_PALETTE[index % WALLET_PALETTE.length];
  const rgb = hexToRgb(color);

  // Apply tilt only when motion is allowed
  const tiltActive = hovered && !prefersReducedMotion;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        aspectRatio: '1.6',
        borderRadius: '20px',
        padding: '22px',
        background: 'linear-gradient(145deg, var(--leather-1), var(--card-2))',
        border: hovered
          ? `1px solid rgba(${rgb}, 0.55)`
          : '1px solid var(--color-edge)',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        outline: 'none',
        transform: tiltActive
          ? 'perspective(700px) translateY(-6px) rotate3d(1, -0.6, 0, 4deg)'
          : 'perspective(700px) translateY(0px) rotate3d(0, 0, 0, 0deg)',
        boxShadow: hovered
          ? '0 20px 50px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.12)',
        transition: '.35s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {/* Radial colour tint overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 70% 25%, rgba(${rgb}, 0.13) 0%, transparent 65%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Diagonal shine overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.07) 46%, transparent 58%)',
          pointerEvents: 'none',
        }}
      />

      {/* Top row: name + description + icon */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          position: 'relative',
          zIndex: 1,
          gap: '8px',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--color-ink)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {wallet.name}
          </p>
          {wallet.description && (
            <p
              style={{
                margin: '2px 0 0',
                fontSize: '12px',
                color: 'var(--color-dim)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {wallet.description}
            </p>
          )}
        </div>
        <WalletIcon color={color} />
      </div>

      {/* Metallic chip */}
      <div
        aria-hidden="true"
        style={{
          marginTop: 'auto',
          width: '42px',
          height: '31px',
          borderRadius: '7px',
          background: 'linear-gradient(145deg, var(--btn-1), var(--btn-2))',
          position: 'relative',
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        {/* Inner chip line */}
        <div
          style={{
            position: 'absolute',
            inset: '6px 8px',
            border: '1px solid rgba(0,0,0,0.28)',
            borderRadius: '4px',
          }}
        />
      </div>

      {/* Total value */}
      <p
        style={{
          margin: '8px 0 0',
          fontSize: '30px',
          fontWeight: 650,
          letterSpacing: '-0.01em',
          color: 'var(--color-ink)',
          textShadow: '0 1px 0 rgba(255,255,255,0.05)',
          lineHeight: 1,
          position: 'relative',
          zIndex: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtCur.format(0)}
      </p>

      {/* Bottom row: P&L pill + asset / operation count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginTop: '8px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '99px',
            background: 'rgba(16,185,129,0.15)',
            color: '#10b981',
            lineHeight: '18px',
          }}
        >
          +0,00%
        </span>
        <span style={{ fontSize: '12px', color: 'var(--color-mid)' }}>
          0 ativos · 0 operações
        </span>
      </div>

      {/* Allocation accent bar at bottom edge */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '5px',
          background: color,
          borderRadius: '0 0 20px 20px',
        }}
      />
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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        minHeight: '220px',
        borderRadius: '20px',
        border: `1.5px dashed ${hovered ? 'var(--color-accent)' : 'var(--color-edge)'}`,
        background: hovered ? 'rgba(var(--raised-rgb), 0.25)' : 'transparent',
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
      <div
        aria-hidden="true"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'var(--color-raised)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background .25s',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-dim)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <span style={{ fontSize: '14px', color: 'var(--color-dim)', fontWeight: 500 }}>
        Nova carteira
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WalletSelector({
  user,
  wallets,
  onSelect,
  onCreateWallet,
  onLogout,
  theme,
  onToggle,
}: Props) {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Sticky header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          height: '60px',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          background: 'var(--header-bg)',
          borderBottom: '1px solid rgba(var(--edge-rgb), 0.5)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '1120px',
            width: '100%',
            margin: '0 auto',
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Brand name with gradient text */}
          <span
            style={{
              fontSize: '17px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              background: 'linear-gradient(90deg, var(--color-ink), var(--color-accent))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Vetor Wallet
          </span>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ThemeToggle theme={theme} onToggle={onToggle} />
            <span
              className="hidden sm:inline"
              style={{ fontSize: '12px', color: 'var(--color-dim)' }}
            >
              {user.email}
            </span>
            <button
              onClick={onLogout}
              className="text-dim hover:text-ink transition-colors cursor-pointer bg-transparent border-0"
              style={{ fontSize: '13px', padding: '4px 0' }}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main
        style={{
          maxWidth: '1120px',
          margin: '0 auto',
          padding: '56px 32px 64px',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '26px',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--color-ink)',
          }}
        >
          Suas carteiras
        </h1>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '14px',
            color: 'var(--color-dim)',
          }}
        >
          Selecione uma carteira para acessar seu dashboard
        </p>

        {/* Wallet grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '18px',
            marginTop: '28px',
          }}
        >
          {wallets.map((wallet, index) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              index={index}
              onClick={() => onSelect(wallet)}
            />
          ))}
          <NewWalletCard onClick={onCreateWallet} />
        </div>
      </main>
    </div>
  );
}
