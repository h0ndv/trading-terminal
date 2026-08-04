use crate::core::model::Candle;
use crate::data::binance;

#[tauri::command]
pub async fn get_historical(symbol: String, timeframe: String) -> Result<Vec<Candle>, String> {
    let interval = binance::to_interval(&timeframe).to_string();
    tracing::info!(%symbol, %timeframe, %interval, "get_historical");
    binance::fetch_klines(&symbol, &interval, 500)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "get_historical failed");
            e.to_string()
        })
}
