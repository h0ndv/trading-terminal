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
