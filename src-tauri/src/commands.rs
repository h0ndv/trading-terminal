use crate::core::model::Candle;
use crate::data::binance::{self, StreamConfig};
use tauri::State;
use tokio::sync::watch;

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

#[tauri::command]
pub fn set_stream(
    config_tx: State<'_, watch::Sender<StreamConfig>>,
    symbol: String,
    timeframe: String,
) -> Result<(), String> {
    let interval = binance::to_interval(&timeframe).to_string();
    let symbol = symbol.to_uppercase();
    let cfg = StreamConfig::new(symbol.clone(), interval.clone());
    tracing::info!(%symbol, %interval, "set_stream");
    let _ = config_tx.send_if_modified(|current| {
        if *current == cfg {
            false
        } else {
            *current = cfg;
            true
        }
    });
    Ok(())
}
