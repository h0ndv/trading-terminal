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

export interface IndicatorPoint {
  timestamp: number;
  values: Record<string, number | null>;
}

export interface IndicatorSeries {
  indicator_id: string;
  calc_params: number[];
  points: IndicatorPoint[];
}

export interface IndicatorSubscription {
  chart_id: string;
  instance_id: string;
  symbol: string;
  timeframe: string;
  indicator_id: string;
  calc_params: number[];
}

export interface IndicatorBootstrapEvent {
  chart_id: string;
  instance_id: string;
  symbol: string;
  timeframe: string;
  series: IndicatorSeries;
}

export interface IndicatorPatchEvent {
  chart_id: string;
  instance_id: string;
  symbol: string;
  timeframe: string;
  point: IndicatorPoint;
}
