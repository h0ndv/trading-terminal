import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  Candle,
  CandleUpdateEvent,
  ChartStreamSubscription,
  IndicatorBootstrapEvent,
  IndicatorPatchEvent,
  IndicatorSubscription,
  SymbolInfo,
  TickerStats,
} from './types';
import {
  setRustIndicatorBootstrap,
  setRustIndicatorPatch,
} from './klineRustIndicators';

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

export function syncTickerSymbols(symbols: string[]): Promise<void> {
  return invoke('sync_ticker_symbols', { symbols });
}

export function syncIndicatorSubscriptions(
  subscriptions: IndicatorSubscription[],
): Promise<void> {
  return invoke('sync_indicator_subscriptions', { subscriptions });
}

type IndicatorBootstrapCallback = (event: IndicatorBootstrapEvent) => void;
type IndicatorPatchCallback = (event: IndicatorPatchEvent) => void;

const indicatorBootstrapListeners = new Map<string, Set<IndicatorBootstrapCallback>>();
const indicatorPatchListeners = new Map<string, Set<IndicatorPatchCallback>>();
let indicatorUnlistenBootstrap: UnlistenFn | null = null;
let indicatorUnlistenPatch: UnlistenFn | null = null;
let indicatorSubscriberCount = 0;

async function ensureIndicatorListeners(): Promise<void> {
  if (!indicatorUnlistenBootstrap) {
    indicatorUnlistenBootstrap = await listen<IndicatorBootstrapEvent>(
      'indicator-bootstrap',
      (event) => {
        const ev = event.payload;
        setRustIndicatorBootstrap(ev.chart_id, ev.instance_id, ev.series.points);
        indicatorBootstrapListeners.get(ev.chart_id)?.forEach((cb) => cb(ev));
      },
    );
  }
  if (!indicatorUnlistenPatch) {
    indicatorUnlistenPatch = await listen<IndicatorPatchEvent>(
      'indicator-patch',
      (event) => {
        const ev = event.payload;
        setRustIndicatorPatch(ev.chart_id, ev.instance_id, ev.point);
        indicatorPatchListeners.get(ev.chart_id)?.forEach((cb) => cb(ev));
      },
    );
  }
}

export function subscribeIndicatorBootstrap(
  chartId: string,
  callback: IndicatorBootstrapCallback,
): () => void {
  let set = indicatorBootstrapListeners.get(chartId);
  if (!set) {
    set = new Set();
    indicatorBootstrapListeners.set(chartId, set);
  }
  set.add(callback);
  indicatorSubscriberCount += 1;
  void ensureIndicatorListeners();

  return () => {
    const bucket = indicatorBootstrapListeners.get(chartId);
    if (!bucket) return;
    bucket.delete(callback);
    if (bucket.size === 0) indicatorBootstrapListeners.delete(chartId);
    indicatorSubscriberCount -= 1;
    if (indicatorSubscriberCount <= 0) {
      void indicatorUnlistenBootstrap?.();
      void indicatorUnlistenPatch?.();
      indicatorUnlistenBootstrap = null;
      indicatorUnlistenPatch = null;
      indicatorSubscriberCount = 0;
    }
  };
}

export function subscribeIndicatorPatch(
  chartId: string,
  callback: IndicatorPatchCallback,
): () => void {
  let set = indicatorPatchListeners.get(chartId);
  if (!set) {
    set = new Set();
    indicatorPatchListeners.set(chartId, set);
  }
  set.add(callback);
  indicatorSubscriberCount += 1;
  void ensureIndicatorListeners();

  return () => {
    const bucket = indicatorPatchListeners.get(chartId);
    if (!bucket) return;
    bucket.delete(callback);
    if (bucket.size === 0) indicatorPatchListeners.delete(chartId);
    indicatorSubscriberCount -= 1;
    if (indicatorSubscriberCount <= 0) {
      void indicatorUnlistenBootstrap?.();
      void indicatorUnlistenPatch?.();
      indicatorUnlistenBootstrap = null;
      indicatorUnlistenPatch = null;
      indicatorSubscriberCount = 0;
    }
  };
}

type TickerCallback = (stats: TickerStats) => void;

const tickerCache = new Map<string, TickerStats>();

const tickerListeners = new Map<string, Set<TickerCallback>>();
let tickerUnlisten: UnlistenFn | null = null;
let tickerSubscriberCount = 0;

async function ensureTickerListener(): Promise<void> {
  if (tickerUnlisten) return;
  tickerUnlisten = await listen<TickerStats>('ticker-update', (event) => {
    const stats = event.payload;
    const key = stats.symbol.toUpperCase();
    tickerCache.set(key, stats);
    tickerListeners.get(key)?.forEach((cb) => cb(stats));
  });
}

export function getCachedTicker(symbol: string): TickerStats | undefined {
  return tickerCache.get(symbol.toUpperCase());
}

export function subscribeTicker(symbol: string, callback: TickerCallback): () => void {
  const key = symbol.toUpperCase();
  let set = tickerListeners.get(key);
  if (!set) {
    set = new Set();
    tickerListeners.set(key, set);
  }
  set.add(callback);
  tickerSubscriberCount += 1;
  void ensureTickerListener();

  return () => {
    const bucket = tickerListeners.get(key);
    if (!bucket) return;
    bucket.delete(callback);
    if (bucket.size === 0) tickerListeners.delete(key);
    tickerSubscriberCount -= 1;
    if (tickerSubscriberCount <= 0 && tickerUnlisten) {
      void tickerUnlisten();
      tickerUnlisten = null;
      tickerSubscriberCount = 0;
    }
  };
}
