import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { searchTickers } from '../api';
import type { TickerInfo } from '@vetor-wallet/shared';

interface Props {
  value: string;
  onChange: (ticker: string, isKnown: boolean | null) => void;
  className?: string;
  placeholder?: string;
}

export function TickerCombobox({ value, onChange, className, placeholder = 'PETR4' }: Props) {
  const [suggestions, setSuggestions] = useState<TickerInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const { results, listAvailable } = await searchTickers(query);
    setSuggestions(results);
    setOpen(results.length > 0);
    setHighlighted(-1);
    // Determine known status for the current exact value
    if (!listAvailable) {
      onChange(query.toUpperCase(), null);
    } else {
      const exactMatch = results.some((r) => r.ticker === query.toUpperCase());
      onChange(query.toUpperCase(), results.length > 0 ? exactMatch : false);
    }
  }, [onChange]);

  function handleInput(raw: string) {
    const upper = raw.toUpperCase();
    onChange(upper, null); // unknown status while debouncing
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(upper), 300);
  }

  function select(ticker: string) {
    onChange(ticker, true);
    setSuggestions([]);
    setOpen(false);
    setHighlighted(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      select(suggestions[highlighted].ticker);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
    }
  }

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlighted(-1);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={highlighted >= 0 ? `${listboxId}-${highlighted}` : undefined}
        className={className}
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (value) runSearch(value); }}
        placeholder={placeholder}
        maxLength={10}
        autoComplete="off"
        spellCheck={false}
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-edge rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.ticker}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === highlighted}
              onPointerDown={(e) => { e.preventDefault(); select(s.ticker); }}
              className={`px-3 py-2 text-sm cursor-pointer flex items-baseline gap-2 ${
                i === highlighted ? 'bg-accent/10 text-ink' : 'text-ink hover:bg-raised/60'
              }`}
            >
              <span className="font-semibold tabular-nums shrink-0">{s.ticker}</span>
              <span className="text-dim text-xs truncate">— {s.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
