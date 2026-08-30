import { useEffect, useRef, useState } from 'react';
import { getCachedTrades, subscribeTrades } from '../lib/marketStream';
import type { TradeTick } from '../lib/types';

export function useTradesTape(symbol: string): TradeTick[] {
  const key = symbol.toUpperCase();
  const [trades, setTrades] = useState<TradeTick[]>(() => getCachedTrades(key));
  const symbolRef = useRef(key);

  useEffect(() => {
    symbolRef.current = key;
    setTrades(getCachedTrades(key));
    return subscribeTrades(symbol, (tick) => {
      if (tick.symbol.toUpperCase() !== symbolRef.current) return;
      setTrades((prev) => {
        const next = [...prev, tick];
        if (next.length > 200) return next.slice(-200);
        return next;
      });
    });
  }, [key, symbol]);

  return trades;
}
