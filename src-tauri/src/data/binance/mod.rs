pub mod rest;
pub mod ws;

pub use rest::{fetch_klines, fetch_symbols};
pub use ws::{run_kline_stream, StreamConfig};

/// Map UI timeframe labels to Binance interval strings.
pub fn to_interval(timeframe: &str) -> &str {
    match timeframe {
        "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" => timeframe,
        _ => "1m",
    }
}
