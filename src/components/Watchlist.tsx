import { IconStar } from './DrawingToolIcons';
import type { SymbolInfo } from '../lib/types';

type Props = {
  tickers: string[];
  activeSymbol: string;
  symbols: SymbolInfo[];
  onSelect: (info: SymbolInfo) => void;
  onRemove: (ticker: string) => void;
  onAddCurrent: () => void;
};

export default function Watchlist({
  tickers,
  activeSymbol,
  symbols,
  onSelect,
  onRemove,
  onAddCurrent,
}: Props) {
  const byTicker = new Map(symbols.map((s) => [s.ticker, s]));
  const activeInList = tickers.includes(activeSymbol);

  return (
    <aside className="watchlist" aria-label="Watchlist">
      <div className="watchlist-header">
        <span className="watchlist-title">Watchlist</span>
        {!activeInList && (
          <button
            type="button"
            className="watchlist-add-btn"
            title={`Add ${activeSymbol}`}
            aria-label={`Add ${activeSymbol} to watchlist`}
            onClick={onAddCurrent}
          >
            <IconStar size={14} />
          </button>
        )}
      </div>
      <ul className="watchlist-list">
        {tickers.length === 0 ? (
          <li className="watchlist-empty">No symbols</li>
        ) : (
          tickers.map((ticker) => {
            const info = byTicker.get(ticker);
            const active = ticker === activeSymbol;
            return (
              <li key={ticker} className="watchlist-row-wrap">
                <button
                  type="button"
                  className={active ? 'watchlist-row active' : 'watchlist-row'}
                  disabled={!info}
                  title={info ? undefined : 'Symbol not in catalog'}
                  onClick={() => {
                    if (info) onSelect(info);
                  }}
                >
                  <span className="watchlist-ticker">{ticker}</span>
                  {info && (
                    <span className="watchlist-pair">
                      {info.base}/{info.quote}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="watchlist-remove-btn"
                  title={`Remove ${ticker}`}
                  aria-label={`Remove ${ticker} from watchlist`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(ticker);
                  }}
                >
                  ×
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
