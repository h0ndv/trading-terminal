use crate::core::model::{Candle, ChartStreamSubscription, SymbolInfo};
use crate::data::binance;
use crate::market::stream_manager::StreamManagerState;
use tauri::State;

#[tauri::command]
pub async fn get_historical(
    symbol: String,
    timeframe: String,
    end_time: Option<i64>,
) -> Result<Vec<Candle>, String> {
    let interval = binance::to_interval(&timeframe).to_string();
    tracing::info!(%symbol, %timeframe, %interval, ?end_time, "get_historical");
    binance::fetch_klines(&symbol, &interval, 1000, end_time)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "get_historical failed");
            e.to_string()
        })
}

#[tauri::command]
pub async fn list_symbols() -> Result<Vec<SymbolInfo>, String> {
    tracing::info!("list_symbols");
    binance::fetch_symbols().await.map_err(|e| {
        tracing::error!(error = %e, "list_symbols failed");
        e.to_string()
    })
}

#[tauri::command]
pub fn sync_chart_streams(
    manager: State<'_, StreamManagerState>,
    subscriptions: Vec<ChartStreamSubscription>,
) -> Result<(), String> {
    tracing::info!(count = subscriptions.len(), "sync_chart_streams");
    let mut guard = manager.0.lock().map_err(|e| e.to_string())?;
    guard.sync(subscriptions);
    Ok(())
}
