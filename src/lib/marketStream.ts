import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Candle, CandleUpdateEvent, ChartStreamSubscription, SymbolInfo } from './types';

export function getHistorical(
  symbol: string,
  timeframe: string,
  endTime?: number,
): Promise<Candle[]> {
  return invoke<Candle[]>('get_historical', { symbol, timeframe, endTime });
}

export function listSymbols(): Promise<SymbolInfo[]> {
  return invoke<SymbolInfo[]>('list_symbols');
}

export function syncChartStreams(subscriptions: ChartStreamSubscription[]): Promise<void> {
  return invoke('sync_chart_streams', { subscriptions });
}

export function streamKey(symbol: string, timeframe: string): string {
  return `${symbol.toUpperCase()}:${timeframe}`;
}

type CandleCallback = (candle: Candle) => void;

const listeners = new Map<string, Set<CandleCallback>>();
let unlisten: UnlistenFn | null = null;
let subscriberCount = 0;

async function ensureListener(): Promise<void> {
  if (unlisten) return;
  unlisten = await listen<CandleUpdateEvent>('candle-update', (event) => {
    const { symbol, timeframe, candle } = event.payload;
    const key = streamKey(symbol, timeframe);
    listeners.get(key)?.forEach((cb) => cb(candle));
  });
}

export function subscribeCandles(
  symbol: string,
  timeframe: string,
  callback: CandleCallback,
): () => void {
  const key = streamKey(symbol, timeframe);
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(callback);
  subscriberCount += 1;
  void ensureListener();

  return () => {
    const bucket = listeners.get(key);
    if (!bucket) return;
    bucket.delete(callback);
    if (bucket.size === 0) listeners.delete(key);
    subscriberCount -= 1;
    if (subscriberCount <= 0 && unlisten) {
      void unlisten();
      unlisten = null;
      subscriberCount = 0;
    }
  };
}

export type ChartStreamSync = {
  chartId: string;
  symbol: string;
  timeframe: string;
};

export function toStreamSubscriptions(charts: ChartStreamSync[]): ChartStreamSubscription[] {
  return charts.map((c) => ({
    chart_id: c.chartId,
    symbol: c.symbol,
    timeframe: c.timeframe,
  }));
}
