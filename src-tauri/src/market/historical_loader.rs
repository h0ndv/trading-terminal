use crate::core::model::Candle;
use crate::data::binance;
use crate::market::candle_store::{CandleKey, CandleStoreState};
use crate::market::indicator_manager::{notify_candles_changed_async, IndicatorManagerState};
use crate::market::CandleChange;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tokio::sync::{Mutex, Notify};

const CACHE_MIN_LEN: usize = 100;
const KLINES_LIMIT: u16 = 1000;

fn in_flight() -> &'static Mutex<HashMap<CandleKey, Arc<Notify>>> {
    static MAP: OnceLock<Mutex<HashMap<CandleKey, Arc<Notify>>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn candles_differ(existing: &[Candle], fresh: &[Candle]) -> bool {
    if existing.len() != fresh.len() {
        return true;
    }
    match (existing.last(), fresh.last()) {
        (Some(a), Some(b)) => {
            a.timestamp != b.timestamp || (a.close - b.close).abs() > 1e-9
        }
        (None, None) => false,
        _ => true,
    }
}

struct StoreUpdate {
    candles: Vec<Candle>,
    change: Option<CandleChange>,
}

fn apply_to_store(
    candle_store: &CandleStoreState,
    symbol: &str,
    timeframe: &str,
    end_time: Option<i64>,
    candles: Vec<Candle>,
) -> StoreUpdate {
    let mut store = match candle_store.0.lock() {
        Ok(guard) => guard,
        Err(err) => {
            tracing::error!(error = %err, "candle store lock poisoned");
            return StoreUpdate {
                candles,
                change: None,
            };
        }
    };

    if end_time.is_some() {
        let change = store.prepend(symbol, timeframe, candles.clone());
        StoreUpdate { candles, change }
    } else {
        let existing = store.snapshot(symbol, timeframe);
        if !candles_differ(&existing, &candles) {
            return StoreUpdate {
                candles: existing.to_vec(),
                change: None,
            };
        }
        let change = Some(store.replace(symbol, timeframe, candles.clone()));
        StoreUpdate { candles, change }
    }
}

async fn fetch_rest(symbol: &str, interval: &str, end_time: Option<i64>) -> Result<Vec<Candle>, String> {
    binance::fetch_klines(symbol, interval, KLINES_LIMIT, end_time)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "historical fetch failed");
            e.to_string()
        })
}

async fn run_fetch(
    candle_store: CandleStoreState,
    indicator_manager: IndicatorManagerState,
    symbol: String,
    timeframe: String,
    interval: String,
    end_time: Option<i64>,
    notify: Arc<Notify>,
) {
    let key = CandleKey::new(&symbol, &timeframe);
    let result = fetch_rest(&symbol, &interval, end_time).await;

    let update = match result {
        Ok(candles) => apply_to_store(&candle_store, &symbol, &timeframe, end_time, candles),
        Err(e) => {
            tracing::warn!(%symbol, %timeframe, error = %e, "background historical fetch failed");
            in_flight().lock().await.remove(&key);
            notify.notify_waiters();
            return;
        }
    };

    if let Some(change) = update.change {
        notify_candles_changed_async(&indicator_manager, symbol, timeframe, change);
    }

    in_flight().lock().await.remove(&key);
    notify.notify_waiters();
}

async fn start_or_join_fetch(
    candle_store: CandleStoreState,
    indicator_manager: IndicatorManagerState,
    symbol: String,
    timeframe: String,
    interval: String,
    end_time: Option<i64>,
) {
    let key = CandleKey::new(&symbol, &timeframe);
    let notify = {
        let mut guard = in_flight().lock().await;
        if let Some(existing) = guard.get(&key) {
            existing.clone()
        } else {
            let notify = Arc::new(Notify::new());
            guard.insert(key.clone(), notify.clone());
            let store = candle_store.clone();
            let mgr = indicator_manager.clone();
            let sym = symbol.clone();
            let tf = timeframe.clone();
            let iv = interval.clone();
            let n = notify.clone();
            tauri::async_runtime::spawn(async move {
                run_fetch(store, mgr, sym, tf, iv, end_time, n).await;
            });
            notify
        }
    };

    notify.notified().await;
}

fn spawn_initial_fetch(
    candle_store: CandleStoreState,
    indicator_manager: IndicatorManagerState,
    symbol: String,
    timeframe: String,
) {
    let interval = binance::to_interval(&timeframe).to_string();
    tauri::async_runtime::spawn(async move {
        start_or_join_fetch(
            candle_store,
            indicator_manager,
            symbol,
            timeframe,
            interval,
            None,
        )
        .await;
    });
}

pub fn prefetch_if_empty(
    candle_store: CandleStoreState,
    indicator_manager: IndicatorManagerState,
    symbol: &str,
    timeframe: &str,
) {
    let symbol = symbol.to_uppercase();
    let len = candle_store
        .0
        .lock()
        .map(|s| s.len(&symbol, timeframe))
        .unwrap_or(0);
    if len >= CACHE_MIN_LEN {
        return;
    }
    spawn_initial_fetch(
        candle_store,
        indicator_manager,
        symbol,
        timeframe.to_string(),
    );
}

pub async fn load_historical(
    candle_store: CandleStoreState,
    indicator_manager: IndicatorManagerState,
    symbol: String,
    timeframe: String,
    end_time: Option<i64>,
) -> Result<Vec<Candle>, String> {
    let symbol = symbol.to_uppercase();
    let interval = binance::to_interval(&timeframe).to_string();
    tracing::info!(%symbol, %timeframe, %interval, ?end_time, "load_historical");

    if end_time.is_none() {
        let cached = {
            let store = candle_store.0.lock().map_err(|e| e.to_string())?;
            store.snapshot(&symbol, &timeframe)
        };
        if cached.len() >= CACHE_MIN_LEN {
            spawn_initial_fetch(
                candle_store.clone(),
                indicator_manager.clone(),
                symbol.clone(),
                timeframe.clone(),
            );
            return Ok(cached.to_vec());
        }

        start_or_join_fetch(
            candle_store.clone(),
            indicator_manager.clone(),
            symbol.clone(),
            timeframe.clone(),
            interval,
            None,
        )
        .await;

        let snapshot = candle_store
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .snapshot(&symbol, &timeframe);
        return Ok(snapshot.to_vec());
    }

    let candles = fetch_rest(&symbol, &interval, end_time).await?;
    let update = apply_to_store(&candle_store, &symbol, &timeframe, end_time, candles);
    if let Some(change) = update.change {
        notify_candles_changed_async(&indicator_manager, symbol, timeframe, change);
    }
    Ok(update.candles)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candles_differ_detects_last_bar_change() {
        let a = vec![Candle {
            timestamp: 1,
            open: 1.0,
            high: 1.0,
            low: 1.0,
            close: 1.0,
            volume: 1.0,
        }];
        let b = vec![Candle {
            timestamp: 1,
            open: 1.0,
            high: 1.0,
            low: 1.0,
            close: 2.0,
            volume: 1.0,
        }];
        assert!(candles_differ(&a, &b));
        assert!(!candles_differ(&a, &a));
    }
}
