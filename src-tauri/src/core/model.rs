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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)] // domain type for future IPC
pub struct Symbol {
    pub ticker: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)] // domain type for future IPC
pub struct Timeframe {
    /// e.g. "1m", "5m", "1h"
    pub label: String,
}
