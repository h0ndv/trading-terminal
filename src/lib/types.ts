export interface CandleUpdateEvent {
  symbol: string;
  timeframe: string;
  candle: Candle;
}

export interface ChartStreamSubscription {
  chart_id: string;
  symbol: string;
  timeframe: string;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolInfo {
  ticker: string;
  base: string;
  quote: string;
  price_precision: number;
  volume_precision: number;
}

export interface TickerStats {
  symbol: string;
  last_price: number;
  price_change: number;
  price_change_percent: number;
  high_price: number;
  low_price: number;
  volume: number;
  quote_volume: number;
}
