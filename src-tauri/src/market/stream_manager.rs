use crate::core::model::{CandleUpdateEvent, ChartStreamSubscription};
use crate::data::binance::{self, StreamConfig};
use crate::events::emit_candle_update;
use crate::market::candle_store::CandleStoreState;
use crate::market::indicator_manager::{notify_candles_changed, IndicatorManagerState};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::AppHandle;
use tokio::sync::{mpsc, watch};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct StreamKey {
    symbol: String,
    interval: String,
    timeframe: String,
}

impl StreamKey {
    fn from_subscription(symbol: &str, timeframe: &str) -> Self {
        let symbol = symbol.to_uppercase();
        let interval = binance::to_interval(timeframe).to_string();
        Self {
            symbol,
            interval,
            timeframe: timeframe.to_string(),
        }
    }
}

struct ActiveStream {
    refcount: usize,
    cancel_tx: watch::Sender<bool>,
}

pub struct StreamManager {
    app: AppHandle,
    candle_store: CandleStoreState,
    indicator_manager: IndicatorManagerState,
    streams: HashMap<StreamKey, ActiveStream>,
    chart_bindings: HashMap<String, StreamKey>,
}

impl StreamManager {
    pub fn new(
        app: AppHandle,
        candle_store: CandleStoreState,
        indicator_manager: IndicatorManagerState,
    ) -> Self {
        Self {
            app,
            candle_store,
            indicator_manager,
            streams: HashMap::new(),
            chart_bindings: HashMap::new(),
        }
    }

    pub fn sync(&mut self, subscriptions: Vec<ChartStreamSubscription>) {
        let desired: HashMap<String, StreamKey> = subscriptions
            .into_iter()
            .map(|s| {
                (
                    s.chart_id,
                    StreamKey::from_subscription(&s.symbol, &s.timeframe),
                )
            })
            .collect();

        let old_bindings = std::mem::take(&mut self.chart_bindings);

        for (chart_id, old_key) in &old_bindings {
            if desired.get(chart_id) != Some(old_key) {
                self.decrement_stream(old_key);
            }
        }

        for (chart_id, new_key) in &desired {
            if old_bindings.get(chart_id) != Some(new_key) {
                self.increment_or_start(new_key);
            }
        }

        self.chart_bindings = desired;
    }

    fn increment_or_start(&mut self, key: &StreamKey) {
        if let Some(stream) = self.streams.get_mut(key) {
            stream.refcount += 1;
            tracing::debug!(
                symbol = %key.symbol,
                interval = %key.interval,
                refcount = stream.refcount,
                "stream refcount incremented"
            );
            return;
        }

        let (cancel_tx, cancel_rx) = watch::channel(false);
        let (tx, mut rx) = mpsc::channel(256);
        let cfg = StreamConfig::new(key.symbol.clone(), key.interval.clone());
        let app = self.app.clone();
        let timeframe = key.timeframe.clone();
        let symbol = key.symbol.clone();
        let candle_store = self.candle_store.clone();
        let indicator_manager = self.indicator_manager.clone();

        tauri::async_runtime::spawn(async move {
            binance::run_kline_stream(cfg, tx, cancel_rx).await;
        });

        tauri::async_runtime::spawn(async move {
            while let Some(candle) = rx.recv().await {
                let change = if let Ok(mut store) = candle_store.0.lock() {
                    store.append_or_update(&symbol, &timeframe, candle.clone())
                } else {
                    tracing::error!("candle store lock poisoned");
                    continue;
                };
                notify_candles_changed(&indicator_manager, &symbol, &timeframe, change);
                let event = CandleUpdateEvent {
                    symbol: symbol.clone(),
                    timeframe: timeframe.clone(),
                    candle,
                };
                emit_candle_update(&app, &event);
            }
        });

        self.streams.insert(
            key.clone(),
            ActiveStream {
                refcount: 1,
                cancel_tx,
            },
        );
        tracing::info!(
            symbol = %key.symbol,
            interval = %key.interval,
            "started kline stream"
        );
    }

    fn decrement_stream(&mut self, key: &StreamKey) {
        let Some(stream) = self.streams.get_mut(key) else {
            return;
        };
        if stream.refcount > 1 {
            stream.refcount -= 1;
            tracing::debug!(
                symbol = %key.symbol,
                interval = %key.interval,
                refcount = stream.refcount,
                "stream refcount decremented"
            );
            return;
        }

        let _ = stream.cancel_tx.send(true);
        self.streams.remove(key);
        tracing::info!(
            symbol = %key.symbol,
            interval = %key.interval,
            "stopped kline stream"
        );
    }
}

pub struct StreamManagerState(pub Mutex<StreamManager>);

impl StreamManagerState {
    pub fn new(
        app: AppHandle,
        candle_store: CandleStoreState,
        indicator_manager: IndicatorManagerState,
    ) -> Self {
        Self(Mutex::new(StreamManager::new(
            app,
            candle_store,
            indicator_manager,
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(symbol: &str, tf: &str) -> StreamKey {
        StreamKey::from_subscription(symbol, tf)
    }

    #[test]
    fn stream_key_normalizes_symbol() {
        let k = key("btcusdt", "1m");
        assert_eq!(k.symbol, "BTCUSDT");
        assert_eq!(k.interval, "1m");
        assert_eq!(k.timeframe, "1m");
    }

    #[test]
    fn refcount_logic_shared_then_release() {
        let mut streams: HashMap<StreamKey, usize> = HashMap::new();
        let k = key("BTCUSDT", "1m");

        *streams.entry(k.clone()).or_insert(0) += 1;
        *streams.entry(k.clone()).or_insert(0) += 1;
        assert_eq!(streams[&k], 2);

        let count = streams.get_mut(&k).unwrap();
        *count -= 1;
        assert_eq!(streams[&k], 1);

        streams.remove(&k);
        assert!(!streams.contains_key(&k));
    }

    #[test]
    fn binding_diff_detects_symbol_change() {
        let old = key("BTCUSDT", "1m");
        let new = key("ETHUSDT", "1m");
        assert_ne!(old, new);
        assert_eq!(old, key("BTCUSDT", "1m"));
    }
}
