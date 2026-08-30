use crate::core::model::{Candle, ChartStreamSubscription, IndicatorSubscription, SymbolInfo};
use crate::data::binance;
use crate::market::candle_store::CandleStoreState;
use crate::market::indicator_manager::{notify_candles_changed, IndicatorManagerState};
use crate::market::market_panel_manager::MarketPanelManagerState;
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

    let change = {
        let mut store = candle_store.0.lock().map_err(|e| e.to_string())?;
        if end_time.is_some() {
            store.prepend(&symbol, &timeframe, candles.clone())
        } else {
            Some(store.replace(&symbol, &timeframe, candles.clone()))
        }
    };
    if let Some(change) = change {
        notify_candles_changed(&indicator_manager, &symbol, &timeframe, change);
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

#[tauri::command]
pub fn sync_market_panel(
    manager: State<'_, MarketPanelManagerState>,
    symbols: Vec<String>,
) -> Result<(), String> {
    tracing::info!(count = symbols.len(), "sync_market_panel");
    let mut guard = manager.0.lock().map_err(|e| e.to_string())?;
    guard.sync(symbols);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::model::IndicatorSubscription;
    use crate::indicators::fixtures::sample_candles;
    use crate::market::indicator_manager::IndicatorManager;
    use std::sync::{Arc, Mutex};
    use std::thread;

    fn ma_subscription(chart_id: &str, instance_id: &str) -> IndicatorSubscription {
        IndicatorSubscription {
            chart_id: chart_id.to_string(),
            instance_id: instance_id.to_string(),
            symbol: "BTCUSDT".to_string(),
            timeframe: "1m".to_string(),
            indicator_id: "MA".to_string(),
            calc_params: vec![5.0],
        }
    }

    fn apply_historical_replace(
        candle_store: &CandleStoreState,
        indicator_manager: &IndicatorManagerState,
        symbol: &str,
        timeframe: &str,
        candles: Vec<Candle>,
    ) {
        let change = {
            let mut store = candle_store.0.lock().unwrap();
            Some(store.replace(symbol, timeframe, candles))
        };
        if let Some(change) = change {
            notify_candles_changed(indicator_manager, symbol, timeframe, change);
        }
    }

    #[test]
    fn historical_replace_notifies_indicators_without_deadlock() {
        let store = CandleStoreState::new();
        let mgr = Arc::new(Mutex::new(IndicatorManager::new_for_test(store.clone())));
        {
            let mut guard = mgr.lock().unwrap();
            guard.sync(vec![ma_subscription("chart-1", "ma-1")]);
        }

        let candles = sample_candles();
        apply_historical_replace(
            &store,
            &IndicatorManagerState(mgr.clone()),
            "BTCUSDT",
            "1m",
            candles.clone(),
        );

        let guard = mgr.lock().unwrap();
        let series = guard
            .test_cached_series("chart-1", "ma-1")
            .expect("series cached");
        assert_eq!(series.points.len(), candles.len());
    }

    #[test]
    fn historical_replace_concurrent_with_indicator_sync_no_deadlock() {
        let store = CandleStoreState::new();
        let mgr = Arc::new(Mutex::new(IndicatorManager::new_for_test(store.clone())));
        let candles = sample_candles();

        store
            .0
            .lock()
            .unwrap()
            .replace("BTCUSDT", "1m", candles.clone());

        let mgr_a = mgr.clone();
        let store_a = store.clone();
        let candles_a = candles.clone();
        let handle = thread::spawn(move || {
            apply_historical_replace(
                &store_a,
                &IndicatorManagerState(mgr_a),
                "BTCUSDT",
                "1m",
                candles_a,
            );
        });

        let mgr_b = mgr.clone();
        let handle2 = thread::spawn(move || {
            let mut guard = mgr_b.lock().unwrap();
            guard.sync(vec![ma_subscription("chart-1", "ma-1")]);
        });

        handle.join().expect("historical thread panicked");
        handle2.join().expect("sync thread panicked");

        let guard = mgr.lock().unwrap();
        let series = guard.test_cached_series("chart-1", "ma-1");
        assert!(series.is_some());
    }
}
