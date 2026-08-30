import type { BookLevel, OrderBookSnapshot } from '../lib/types';

type Props = {
  book: OrderBookSnapshot | null;
  pricePrecision: number;
  volumePrecision: number;
};

function formatNum(value: number, precision: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

function maxQty(levels: BookLevel[]): number {
  let max = 0;
  for (const level of levels) {
    if (level.qty > max) max = level.qty;
  }
  return max;
}

function LevelRow({
  level,
  side,
  max,
  pricePrecision,
  volumePrecision,
}: {
  level: BookLevel;
  side: 'ask' | 'bid';
  max: number;
  pricePrecision: number;
  volumePrecision: number;
}) {
  const pct = max > 0 ? (level.qty / max) * 100 : 0;
  return (
    <div className={`book-row book-row-${side}`}>
      <div className="book-row-bar" style={{ width: `${pct}%` }} aria-hidden />
      <span className="book-row-price">{formatNum(level.price, pricePrecision)}</span>
      <span className="book-row-qty">{formatNum(level.qty, volumePrecision)}</span>
    </div>
  );
}

export default function OrderBook({ book, pricePrecision, volumePrecision }: Props) {
  if (!book || (book.bids.length === 0 && book.asks.length === 0)) {
    return <div className="book-empty">No book data</div>;
  }

  const asks = [...book.asks].reverse();
  const bids = book.bids;
  const bestAsk = book.asks[0]?.price;
  const bestBid = book.bids[0]?.price;
  const spread = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const maxQtyVal = Math.max(maxQty(asks), maxQty(bids));

  return (
    <div className="order-book">
      <div className="book-header">
        <span>Price</span>
        <span>Size</span>
      </div>
      <div className="book-asks">
        {asks.map((level, i) => (
          <LevelRow
            key={`a-${level.price}-${i}`}
            level={level}
            side="ask"
            max={maxQtyVal}
            pricePrecision={pricePrecision}
            volumePrecision={volumePrecision}
          />
        ))}
      </div>
      <div className="book-spread">
        {spread != null ? (
          <>
            <span className="book-spread-label">Spread</span>
            <span>{formatNum(spread, pricePrecision)}</span>
          </>
        ) : (
          <span className="book-spread-label">—</span>
        )}
      </div>
      <div className="book-bids">
        {bids.map((level, i) => (
          <LevelRow
            key={`b-${level.price}-${i}`}
            level={level}
            side="bid"
            max={maxQtyVal}
            pricePrecision={pricePrecision}
            volumePrecision={volumePrecision}
          />
        ))}
      </div>
    </div>
  );
}
