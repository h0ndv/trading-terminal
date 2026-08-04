import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { listSymbols } from "../lib/tauriBridge";
import type { SymbolInfo } from "../lib/types";

type Props = {
  value: string;
  onSelect: (info: SymbolInfo) => void;
  symbols: SymbolInfo[];
  loading: boolean;
};

const MAX_RESULTS = 50;

export default function SymbolPicker({
  value,
  onSelect,
  symbols,
  loading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) {
      return symbols.slice(0, MAX_RESULTS);
    }
    return symbols
      .filter(
        (s) =>
          s.ticker.includes(q) ||
          s.base.toUpperCase().includes(q) ||
          s.quote.toUpperCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [query, symbols]);

  function pick(info: SymbolInfo) {
    onSelect(info);
    setQuery(info.ticker);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery(value);
      return;
    }
    if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      pick(filtered[0]);
    }
  }

  return (
    <div className="symbol-picker" ref={rootRef}>
      <input
        className="symbol-input"
        value={query}
        aria-label="Symbol"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={loading ? "Loading…" : "Symbol"}
        disabled={loading && symbols.length === 0}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="symbol-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="symbol-empty">No matches</li>
          ) : (
            filtered.map((s) => (
              <li key={s.ticker}>
                <button
                  type="button"
                  className={
                    s.ticker === value
                      ? "symbol-option active"
                      : "symbol-option"
                  }
                  role="option"
                  aria-selected={s.ticker === value}
                  onClick={() => pick(s)}
                >
                  <span className="symbol-ticker">{s.ticker}</span>
                  <span className="symbol-pair">
                    {s.base}/{s.quote}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Load catalog once; shared by App. */
export function useSymbolCatalog() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSymbols()
      .then((list) => {
        if (!cancelled) {
          setSymbols(list);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          console.error("list_symbols failed", e);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { symbols, loading, error };
}
