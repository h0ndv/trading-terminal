import { useEffect, useState } from 'react';
import { getCachedOrderBook, subscribeOrderBook } from '../lib/marketStream';
import type { OrderBookSnapshot } from '../lib/types';

export function useOrderBook(symbol: string): OrderBookSnapshot | null {
  const key = symbol.toUpperCase();
  const [book, setBook] = useState<OrderBookSnapshot | null>(() => getCachedOrderBook(key) ?? null);

  useEffect(() => {
    setBook(getCachedOrderBook(key) ?? null);
    return subscribeOrderBook(symbol, setBook);
  }, [key, symbol]);

  return book;
}
