use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SymbolInfo {
    pub ticker: String,
    pub base: String,
    pub quote: String,
    pub price_precision: i32,
    pub volume_precision: i32,
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
pub struct IndicatorPoint {
    pub timestamp: i64,
    pub values: HashMap<String, Option<f64>>,
}

impl IndicatorPoint {
    pub fn empty(timestamp: i64) -> Self {
        Self {
            timestamp,
            values: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorSeries {
    pub indicator_id: String,
    pub calc_params: Vec<f64>,
    pub points: Vec<IndicatorPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorSubscription {
    pub chart_id: String,
    pub instance_id: String,
    pub symbol: String,
    pub timeframe: String,
    pub indicator_id: String,
    pub calc_params: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorBootstrapEvent {
    pub chart_id: String,
    pub instance_id: String,
    pub symbol: String,
    pub timeframe: String,
    pub series: IndicatorSeries,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorPatchEvent {
    pub chart_id: String,
    pub instance_id: String,
    pub symbol: String,
    pub timeframe: String,
    pub point: IndicatorPoint,
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
