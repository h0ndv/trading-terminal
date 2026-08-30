use crate::core::model::{Candle, ChartStreamSubscription, IndicatorSubscription, SymbolInfo};
use crate::data::binance;
use crate::market::candle_store::CandleStoreState;
use crate::market::indicator_manager::{notify_candles_changed, IndicatorManagerState};
use crate::market::stream_manager::StreamManagerState;
use crate::market::ticker_manager::TickerManagerState;
use tauri::State;

#[tauri::command]
pub async fn get_historical(
    candle_store: State<'_, CandleStoreState>,
    indicator_manager: State<'_, IndicatorManagerState>,
    symbol: String,
    timeframe: String,
    end_time: Option<i64>,
) -> Result<Vec<Candle>, String> {
    let interval = binance::to_interval(&timeframe).to_string();
    tracing::info!(%symbol, %timeframe, %interval, ?end_time, "get_historical");
    let candles = binance::fetch_klines(&symbol, &interval, 1000, end_time)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "get_historical failed");
            e.to_string()
        })?;

    {
        let mut store = candle_store.0.lock().map_err(|e| e.to_string())?;
        if end_time.is_some() {
            if let Some(change) = store.prepend(&symbol, &timeframe, candles.clone()) {
                notify_candles_changed(&indicator_manager, &symbol, &timeframe, change);
            }
        } else {
            let change = store.replace(&symbol, &timeframe, candles.clone());
            notify_candles_changed(&indicator_manager, &symbol, &timeframe, change);
        }
    }

    Ok(candles)
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

#[tauri::command]
pub fn sync_ticker_symbols(
    manager: State<'_, TickerManagerState>,
    symbols: Vec<String>,
) -> Result<(), String> {
    tracing::info!(count = symbols.len(), "sync_ticker_symbols");
    let mut guard = manager.0.lock().map_err(|e| e.to_string())?;
    guard.sync(symbols);
    Ok(())
}

#[tauri::command]
pub fn sync_indicator_subscriptions(
    manager: State<'_, IndicatorManagerState>,
    subscriptions: Vec<IndicatorSubscription>,
) -> Result<(), String> {
    tracing::info!(count = subscriptions.len(), "sync_indicator_subscriptions");
    let mut guard = manager.0.lock().map_err(|e| e.to_string())?;
    guard.sync(subscriptions);
    Ok(())
}
