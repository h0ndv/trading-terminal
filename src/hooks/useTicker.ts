import { useEffect, useState } from 'react';
import { getCachedTicker, subscribeTicker } from '../lib/marketStream';
import type { TickerStats } from '../lib/types';

export function useTicker(symbol: string): TickerStats | null {
  const key = symbol.toUpperCase();
  const [stats, setStats] = useState<TickerStats | null>(
    () => getCachedTicker(key) ?? null,
  );

  useEffect(() => {
    setStats(getCachedTicker(key) ?? null);
    return subscribeTicker(symbol, setStats);
  }, [key, symbol]);

  return stats;
}
