use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// Tradable market pair with display precision for the chart.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SymbolInfo {
    pub ticker: String,
    pub base: String,
    pub quote: String,
    pub price_precision: i32,
    pub volume_precision: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct Symbol {
    pub ticker: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct Timeframe {
    /// e.g. "1m", "5m", "1h"
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartStreamSubscription {
    pub chart_id: String,
    pub symbol: String,
    pub timeframe: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandleUpdateEvent {
    pub symbol: String,
    pub timeframe: String,
    pub candle: Candle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TickerStats {
    pub symbol: String,
    pub last_price: f64,
    pub price_change: f64,
    pub price_change_percent: f64,
    pub high_price: f64,
    pub low_price: f64,
    pub volume: f64,
    pub quote_volume: f64,
}
