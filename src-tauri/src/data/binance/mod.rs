pub mod depth;
pub mod market_panel;
pub mod rest;
pub mod ticker;
pub mod trade;
pub mod ws;

pub use depth::fetch_depth;
pub use market_panel::{
    bootstrap_market_panel, run_combined_market_panel_stream, run_market_panel_stream,
};
pub use rest::{fetch_klines, fetch_symbols};
pub use ticker::{fetch_ticker_24h, run_combined_ticker_stream, run_ticker_stream};
pub use ws::{run_kline_stream, StreamConfig};

/// Map UI timeframe labels to Binance interval strings.
pub fn to_interval(timeframe: &str) -> &str {
    match timeframe {
        "1m" => "1m",
        "3m" => "3m",
        "5m" => "5m",
        "15m" => "15m",
        "30m" => "30m",
        "1h" => "1h",
        "2h" => "2h",
        "4h" => "4h",
        "6h" => "6h",
        "8h" => "8h",
        "12h" => "12h",
        "1d" => "1d",
        "3d" => "3d",
        "1w" => "1w",
        "1M" => "1M",
        _ => "1m",
    }
}
