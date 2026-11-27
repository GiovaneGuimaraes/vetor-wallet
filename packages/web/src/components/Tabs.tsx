import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<K extends string> {
  key: K;
  label: string;
}

/**
 * Abas acessíveis (padrão WAI-ARIA "tabs", ativação automática): `tablist`/`tab`,
 * tabindex em roving, setas ←/→ (com volta), Home/End. O painel é do chamador
 * (`TabPanel`), que renderiza SÓ o painel ativo — o conteúdo das outras abas
 * nem monta, então não dispara fetch.
 */
export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  idPrefix,
  ariaLabel,
}: {
  tabs: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  idPrefix: string;
  ariaLabel: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function focusAndSelect(index: number) {
    const next = tabs[(index + tabs.length) % tabs.length];
    onChange(next.key);
    refs.current[next.key]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight') focusAndSelect(index + 1);
    else if (e.key === 'ArrowLeft') focusAndSelect(index - 1);
    else if (e.key === 'Home') focusAndSelect(0);
    else if (e.key === 'End') focusAndSelect(tabs.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div className="vw-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t, i) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[t.key] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            className="vw-tab"
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  tabKey,
  children,
}: {
  idPrefix: string;
  tabKey: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tabKey}`}
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      className="vw-tab-panel"
    >
      {children}
    </div>
  );
}
