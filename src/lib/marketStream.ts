import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  Candle,
  CandleUpdateEvent,
  ChartStreamSubscription,
  IndicatorBootstrapEvent,
  IndicatorPatchEvent,
  IndicatorSubscription,
  OrderBookSnapshot,
  SymbolInfo,
  TickerStats,
  TradeTick,
} from './types';
import { setRustIndicatorBootstrap, setRustIndicatorPatch } from './klineRustIndicators';

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

export function syncIndicatorSubscriptions(subscriptions: IndicatorSubscription[]): Promise<void> {
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
    indicatorUnlistenPatch = await listen<IndicatorPatchEvent>('indicator-patch', (event) => {
      const ev = event.payload;
      setRustIndicatorPatch(ev.chart_id, ev.instance_id, ev.point);
      indicatorPatchListeners.get(ev.chart_id)?.forEach((cb) => cb(ev));
    });
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

export function syncMarketPanel(symbols: string[]): Promise<void> {
  return invoke('sync_market_panel', { symbols });
}

const TAPE_MAX = 200;

type BookCallback = (book: OrderBookSnapshot) => void;
type TradeCallback = (tick: TradeTick) => void;

const bookCache = new Map<string, OrderBookSnapshot>();
const tapeCache = new Map<string, TradeTick[]>();

const bookListeners = new Map<string, Set<BookCallback>>();
const tradeListeners = new Map<string, Set<TradeCallback>>();

let bookUnlisten: UnlistenFn | null = null;
let tradeUnlisten: UnlistenFn | null = null;
let marketPanelSubscriberCount = 0;

const pendingBooks = new Map<string, OrderBookSnapshot>();
let bookRaf = 0;

function flushPendingBooks() {
  bookRaf = 0;
  if (pendingBooks.size === 0) return;
  for (const book of pendingBooks.values()) {
    const key = book.symbol.toUpperCase();
    bookCache.set(key, book);
    bookListeners.get(key)?.forEach((cb) => cb(book));
  }
  pendingBooks.clear();
}

function scheduleBookFlush(book: OrderBookSnapshot) {
  pendingBooks.set(book.symbol.toUpperCase(), book);
  if (bookRaf !== 0) return;
  bookRaf = requestAnimationFrame(flushPendingBooks);
}

function pushTapeTick(tick: TradeTick) {
  const key = tick.symbol.toUpperCase();
  let buf = tapeCache.get(key);
  if (!buf) {
    buf = [];
    tapeCache.set(key, buf);
  }
  buf.push(tick);
  if (buf.length > TAPE_MAX) {
    buf.splice(0, buf.length - TAPE_MAX);
  }
  tradeListeners.get(key)?.forEach((cb) => cb(tick));
}

async function ensureMarketPanelListeners(): Promise<void> {
  if (!bookUnlisten) {
    bookUnlisten = await listen<OrderBookSnapshot>('book-update', (event) => {
      scheduleBookFlush(event.payload);
    });
  }
  if (!tradeUnlisten) {
    tradeUnlisten = await listen<TradeTick>('trade-update', (event) => {
      pushTapeTick(event.payload);
    });
  }
}

export function getCachedOrderBook(symbol: string): OrderBookSnapshot | undefined {
  return bookCache.get(symbol.toUpperCase());
}

export function getCachedTrades(symbol: string): TradeTick[] {
  return tapeCache.get(symbol.toUpperCase()) ?? [];
}

export function subscribeOrderBook(symbol: string, callback: BookCallback): () => void {
  const key = symbol.toUpperCase();
  let set = bookListeners.get(key);
  if (!set) {
    set = new Set();
    bookListeners.set(key, set);
  }
  set.add(callback);
  marketPanelSubscriberCount += 1;
  void ensureMarketPanelListeners();

  return () => {
    const bucket = bookListeners.get(key);
    if (!bucket) return;
    bucket.delete(callback);
    if (bucket.size === 0) bookListeners.delete(key);
    marketPanelSubscriberCount -= 1;
    if (marketPanelSubscriberCount <= 0) {
      void bookUnlisten?.();
      void tradeUnlisten?.();
      bookUnlisten = null;
      tradeUnlisten = null;
      marketPanelSubscriberCount = 0;
      if (bookRaf !== 0) {
        cancelAnimationFrame(bookRaf);
        bookRaf = 0;
        pendingBooks.clear();
      }
    }
  };
}

export function subscribeTrades(symbol: string, callback: TradeCallback): () => void {
  const key = symbol.toUpperCase();
  let set = tradeListeners.get(key);
  if (!set) {
    set = new Set();
    tradeListeners.set(key, set);
  }
  set.add(callback);
  marketPanelSubscriberCount += 1;
  void ensureMarketPanelListeners();

  return () => {
    const bucket = tradeListeners.get(key);
    if (!bucket) return;
    bucket.delete(callback);
    if (bucket.size === 0) tradeListeners.delete(key);
    marketPanelSubscriberCount -= 1;
    if (marketPanelSubscriberCount <= 0) {
      void bookUnlisten?.();
      void tradeUnlisten?.();
      bookUnlisten = null;
      tradeUnlisten = null;
      marketPanelSubscriberCount = 0;
      if (bookRaf !== 0) {
        cancelAnimationFrame(bookRaf);
        bookRaf = 0;
        pendingBooks.clear();
      }
    }
  };
}

export function clearMarketPanelCache(symbol: string): void {
  const key = symbol.toUpperCase();
  bookCache.delete(key);
  tapeCache.delete(key);
}
