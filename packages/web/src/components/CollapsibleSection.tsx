import { useState, type ReactNode } from 'react';
import '../routes/layers.css';

/**
 * Seção recolhível genérica (T-074): padrão compartilhado para separar
 * consulta (sempre visível) de edição/criação (atrás de um botão), já que o
 * uso real das pages de layer é consulta ~10x mais frequente que lançamento.
 *
 * Não-controlado por padrão (estado próprio, `defaultOpen`); pode virar
 * controlado passando `open`/`onOpenChange` — necessário para permitir
 * deep-link abrindo o formulário já expandido (ex.: T-086) sem duplicar a
 * lógica de toggle em cada page consumidora.
 */
export interface CollapsibleSectionProps {
  /** Texto do botão quando a seção está recolhida (ex.: "+ Adicionar despesa"). */
  label: string;
  /** Texto do botão quando a seção está aberta; usa `label` se omitido. */
  openLabel?: string;
  children: ReactNode;
  /** Estado inicial quando não-controlado. Default: recolhido. */
  defaultOpen?: boolean;
  /** Estado controlado (opcional) — se informado, `onOpenChange` é obrigatório para refletir o toggle. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function CollapsibleSection({
  label,
  openLabel,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  function toggle() {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <div className={`vw-collapsible${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="vw-collapsible-trigger"
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="vw-collapsible-trigger-icon" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
        {open ? (openLabel ?? label) : label}
      </button>
      {open && <div className="vw-collapsible-content">{children}</div>}
    </div>
  );
}
