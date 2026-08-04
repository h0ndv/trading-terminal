pub mod rest;
pub mod ws;

pub use rest::fetch_klines;
pub use ws::run_stream;

/// Map UI timeframe labels to Binance interval strings.
pub fn to_interval(timeframe: &str) -> &str {
    match timeframe {
        "1m" | "5m" | "15m" | "1h" | "4h" | "1d" => timeframe,
        _ => "1m",
    }
}
