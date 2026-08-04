use crate::core::model::Candle;
use crate::data::synthetic;

#[tauri::command]
pub fn get_historical(symbol: String, timeframe: String) -> Result<Vec<Candle>, String> {
    tracing::info!(%symbol, %timeframe, "get_historical");
    let interval_ms = match timeframe.as_str() {
        "1m" => 60_000,
        "5m" => 300_000,
        "15m" => 900_000,
        "1h" => 3_600_000,
        _ => 60_000,
    };
    let start_price = if symbol.to_uppercase().contains("BTC") {
        65_000.0
    } else {
        100.0
    };
    Ok(synthetic::generate(300, start_price, interval_ms))
}
