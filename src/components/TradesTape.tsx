import { useEffect, useRef } from 'react';
import type { TradeTick } from '../lib/types';

type Props = {
  trades: TradeTick[];
  pricePrecision: number;
  volumePrecision: number;
};

function formatNum(value: number, precision: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function TradesTape({ trades, pricePrecision, volumePrecision }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    if (!pinnedRef.current || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [trades]);

  return (
    <div className="trades-tape">
      <div className="tape-header">
        <span>Time</span>
        <span>Price</span>
        <span>Qty</span>
      </div>
      <div
        ref={listRef}
        className="tape-list"
        onScroll={() => {
          const el = listRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          pinnedRef.current = atBottom;
        }}
      >
        {trades.length === 0 ? (
          <div className="tape-empty">No trades</div>
        ) : (
          trades.map((t, i) => {
            const side = t.is_buyer_maker ? 'sell' : 'buy';
            return (
              <div key={`${t.time}-${t.price}-${i}`} className={`tape-row tape-row-${side}`}>
                <span className="tape-time">{formatTime(t.time)}</span>
                <span className="tape-price">{formatNum(t.price, pricePrecision)}</span>
                <span className="tape-qty">{formatNum(t.qty, volumePrecision)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
