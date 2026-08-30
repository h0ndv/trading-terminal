import OrderBook from './OrderBook';
import TradesTape from './TradesTape';
import { useOrderBook } from '../hooks/useOrderBook';
import { useTradesTape } from '../hooks/useTradesTape';
import type { MarketDockTab } from '../lib/types';

type Props = {
  symbol: string;
  tab: MarketDockTab;
  onTabChange: (tab: MarketDockTab) => void;
  pricePrecision: number;
  volumePrecision: number;
};

export default function MarketDock({
  symbol,
  tab,
  onTabChange,
  pricePrecision,
  volumePrecision,
}: Props) {
  const book = useOrderBook(symbol);
  const trades = useTradesTape(symbol);

  return (
    <aside className="market-dock" aria-label="Market data">
      <div className="market-dock-header">
        <span className="market-dock-symbol">{symbol}</span>
        <div className="market-dock-tabs" role="tablist" aria-label="Market panel">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'book'}
            className={tab === 'book' ? 'market-dock-tab active' : 'market-dock-tab'}
            onClick={() => onTabChange('book')}
          >
            Book
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'tape'}
            className={tab === 'tape' ? 'market-dock-tab active' : 'market-dock-tab'}
            onClick={() => onTabChange('tape')}
          >
            Tape
          </button>
        </div>
      </div>
      <div className="market-dock-body">
        {tab === 'book' ? (
          <OrderBook
            book={book}
            pricePrecision={pricePrecision}
            volumePrecision={volumePrecision}
          />
        ) : (
          <TradesTape
            trades={trades}
            pricePrecision={pricePrecision}
            volumePrecision={volumePrecision}
          />
        )}
      </div>
    </aside>
  );
}
