use crate::core::model::{Candle, IndicatorPoint, IndicatorSeries, IndicatorSubscription};
use crate::events::{emit_indicator_bootstrap, emit_indicator_patch};
use crate::indicators::warm::{apply_candle, warm_state};
use crate::indicators::{get_indicator, traits::IndicatorState};
use crate::indicators::types::IndicatorError;
use crate::market::candle_store::CandleStoreState;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ComputeKey {
    symbol: String,
    timeframe: String,
    indicator_id: String,
    calc_params: Vec<i64>,
}

impl ComputeKey {
    fn from_sub(sub: &IndicatorSubscription) -> Result<Self, IndicatorError> {
        let indicator = get_indicator(&sub.indicator_id)?;
        indicator.validate_params(&sub.calc_params)?;
        Ok(Self {
            symbol: sub.symbol.to_uppercase(),
            timeframe: sub.timeframe.clone(),
            indicator_id: sub.indicator_id.to_uppercase(),
            calc_params: normalize_params(&sub.calc_params),
        })
    }

    fn calc_params_f64(&self) -> Vec<f64> {
        self.calc_params
            .iter()
            .map(|p| *p as f64 / 1000.0)
            .collect()
    }
}

fn normalize_params(params: &[f64]) -> Vec<i64> {
    params
        .iter()
        .map(|p| (p * 1000.0).round() as i64)
        .collect()
}

struct CachedCompute {
    series: IndicatorSeries,
    state: Box<dyn IndicatorState>,
    subscribers: HashSet<String>,
}

struct Binding {
    chart_id: String,
    instance_id: String,
    compute_key: ComputeKey,
}

pub struct IndicatorManager {
    app: Option<AppHandle>,
    candle_store: CandleStoreState,
    bindings: HashMap<String, Binding>,
    computes: HashMap<ComputeKey, CachedCompute>,
}

impl IndicatorManager {
    pub fn new(app: AppHandle, candle_store: CandleStoreState) -> Self {
        Self {
            app: Some(app),
            candle_store,
            bindings: HashMap::new(),
            computes: HashMap::new(),
        }
    }

    #[cfg(any(test, feature = "test-hooks"))]
    pub fn new_for_test(candle_store: CandleStoreState) -> Self {
        Self {
            app: None,
            candle_store,
            bindings: HashMap::new(),
            computes: HashMap::new(),
        }
    }

    pub fn sync(&mut self, subscriptions: Vec<IndicatorSubscription>) {
        let desired: HashMap<String, Binding> = subscriptions
            .into_iter()
            .filter_map(|sub| {
                ComputeKey::from_sub(&sub).ok().map(|key| {
                    let binding_key = format!("{}:{}", sub.chart_id, sub.instance_id);
                    (
                        binding_key,
                        Binding {
                            chart_id: sub.chart_id,
                            instance_id: sub.instance_id,
                            compute_key: key,
                        },
                    )
                })
            })
            .collect();

        let old_bindings = std::mem::take(&mut self.bindings);

        for (key, old) in &old_bindings {
            if !desired.contains_key(key) {
                self.remove_binding(key, &old.compute_key);
            }
        }

        for (key, binding) in &desired {
            if old_bindings.get(key).map(|b| &b.compute_key) != Some(&binding.compute_key) {
                if let Some(old) = old_bindings.get(key) {
                    self.remove_binding(key, &old.compute_key);
                }
                self.add_binding(key, binding);
            }
        }

        self.bindings = desired;
    }

    pub fn on_candles_changed(&mut self, symbol: &str, timeframe: &str, prepended: bool) {
        let symbol = symbol.to_uppercase();
        self.ensure_pending_computes(&symbol, timeframe);

        let affected: Vec<ComputeKey> = self
            .computes
            .keys()
            .filter(|k| k.symbol == symbol && k.timeframe == timeframe)
            .cloned()
            .collect();

        for key in affected {
            if prepended {
                self.recompute_full(&key);
            } else {
                self.patch_last(&key);
            }
        }
    }

    fn ensure_pending_computes(&mut self, symbol: &str, timeframe: &str) {
        let pending: Vec<(String, Binding)> = self
            .bindings
            .iter()
            .filter(|(_, b)| b.compute_key.symbol == symbol && b.compute_key.timeframe == timeframe)
            .filter(|(_, b)| !self.computes.contains_key(&b.compute_key))
            .map(|(k, b)| (k.clone(), b.clone()))
            .collect();
        for (binding_key, binding) in pending {
            self.init_compute(&binding_key, &binding);
        }
    }

    fn init_compute(&mut self, binding_key: &str, binding: &Binding) {
        let key = binding.compute_key.clone();
        let candles = self.snapshot_candles(&key);
        if candles.is_empty() {
            return;
        }
        let Ok(series) = self.compute_series(&key, &candles) else {
            return;
        };
        let Ok(state) = self.warm_state(&key, &candles, candles.len()) else {
            return;
        };
        let mut subscribers = HashSet::new();
        subscribers.insert(binding_key.to_string());
        self.computes.insert(
            key.clone(),
            CachedCompute {
                series: series.clone(),
                state,
                subscribers,
            },
        );
        self.emit_bootstrap_for_binding(binding, &series);
    }

    fn add_binding(&mut self, binding_key: &str, binding: &Binding) {
        let key = binding.compute_key.clone();
        if !self.computes.contains_key(&key) {
            self.init_compute(binding_key, binding);
        }

        let series = if let Some(cache) = self.computes.get_mut(&key) {
            cache.subscribers.insert(binding_key.to_string());
            cache.series.clone()
        } else {
            return;
        };
        self.emit_bootstrap_for_binding(binding, &series);
    }

    fn remove_binding(&mut self, binding_key: &str, compute_key: &ComputeKey) {
        if let Some(cache) = self.computes.get_mut(compute_key) {
            cache.subscribers.remove(binding_key);
            if cache.subscribers.is_empty() {
                self.computes.remove(compute_key);
            }
        }
    }

    fn snapshot_candles(&self, key: &ComputeKey) -> Arc<[Candle]> {
        self.candle_store
            .0
            .lock()
            .map(|store| store.snapshot(&key.symbol, &key.timeframe))
            .unwrap_or_else(|_| Arc::from([]))
    }

    fn compute_series(
        &self,
        key: &ComputeKey,
        candles: &[Candle],
    ) -> Result<IndicatorSeries, IndicatorError> {
        let indicator = get_indicator(&key.indicator_id)?;
        let params = key.calc_params_f64();
        Ok(indicator.compute_all(candles, &params))
    }

    fn warm_state(
        &self,
        key: &ComputeKey,
        candles: &[Candle],
        end_exclusive: usize,
    ) -> Result<Box<dyn IndicatorState>, IndicatorError> {
        let indicator = get_indicator(&key.indicator_id)?;
        let params = key.calc_params_f64();
        warm_state(indicator, &params, candles, end_exclusive)
    }

    fn recompute_full(&mut self, key: &ComputeKey) {
        let candles = self.snapshot_candles(key);
        if candles.is_empty() {
            return;
        }
        let Ok(series) = self.compute_series(key, &candles) else {
            return;
        };
        let Ok(state) = self.warm_state(key, &candles, candles.len()) else {
            return;
        };
        let bindings: Vec<Binding> = self
            .bindings
            .values()
            .filter(|b| b.compute_key == *key)
            .cloned()
            .collect();

        if let Some(cache) = self.computes.get_mut(key) {
            cache.series = series.clone();
            cache.state = state;
        } else {
            let subscribers: HashSet<String> = bindings
                .iter()
                .map(|b| format!("{}:{}", b.chart_id, b.instance_id))
                .collect();
            self.computes.insert(
                key.clone(),
                CachedCompute {
                    series: series.clone(),
                    state,
                    subscribers,
                },
            );
        }

        for binding in bindings {
            self.emit_bootstrap_for_binding(&binding, &series);
        }
    }

    fn patch_last(&mut self, key: &ComputeKey) {
        let candles = self.snapshot_candles(key);
        if candles.is_empty() {
            return;
        }
        let last_idx = candles.len() - 1;
        let last_ts = candles[last_idx].timestamp;

        let series_last_ts = self
            .computes
            .get(key)
            .and_then(|cache| cache.series.points.last().map(|p| p.timestamp));

        match series_last_ts {
            None => {
                self.recompute_full(key);
                return;
            }
            Some(ts) if ts > last_ts => {
                self.recompute_full(key);
                return;
            }
            _ => {}
        }

        let same_bar = series_last_ts == Some(last_ts);
        let (point, replacement_state) = if same_bar {
            let Ok(mut state) = self.warm_state(key, &candles, last_idx) else {
                return;
            };
            let point = apply_candle(state.as_mut(), &candles, last_idx);
            (point, Some(state))
        } else {
            let Some(cache) = self.computes.get_mut(key) else {
                return;
            };
            let point = apply_candle(cache.state.as_mut(), &candles, last_idx);
            (point, None)
        };

        let Some(cache) = self.computes.get_mut(key) else {
            return;
        };
        if let Some(state) = replacement_state {
            cache.state = state;
        }

        let replacing = cache.series.points.last().map(|p| p.timestamp) == Some(last_ts);
        if replacing {
            if let Some(last) = cache.series.points.last_mut() {
                *last = point.clone();
            }
        } else {
            cache.series.points.push(point.clone());
        }

        let bindings: Vec<Binding> = self
            .bindings
            .values()
            .filter(|b| b.compute_key == *key)
            .cloned()
            .collect();
        for binding in bindings {
            self.emit_patch_for_binding(&binding, &point);
        }
    }

    fn emit_bootstrap_for_binding(&self, binding: &Binding, series: &IndicatorSeries) {
        let Some(app) = &self.app else {
            return;
        };
        emit_indicator_bootstrap(
            app,
            &binding.chart_id,
            &binding.instance_id,
            &binding.compute_key.symbol,
            &binding.compute_key.timeframe,
            series,
        );
    }

    fn emit_patch_for_binding(&self, binding: &Binding, point: &IndicatorPoint) {
        let Some(app) = &self.app else {
            return;
        };
        emit_indicator_patch(
            app,
            &binding.chart_id,
            &binding.instance_id,
            &binding.compute_key.symbol,
            &binding.compute_key.timeframe,
            point,
        );
    }

    #[cfg(any(test, feature = "test-hooks"))]
    pub fn test_cached_series(
        &self,
        chart_id: &str,
        instance_id: &str,
    ) -> Option<IndicatorSeries> {
        let binding_key = format!("{chart_id}:{instance_id}");
        let binding = self.bindings.get(&binding_key)?;
        self.computes
            .get(&binding.compute_key)
            .map(|c| c.series.clone())
    }
}

impl Clone for Binding {
    fn clone(&self) -> Self {
        Self {
            chart_id: self.chart_id.clone(),
            instance_id: self.instance_id.clone(),
            compute_key: self.compute_key.clone(),
        }
    }
}

pub struct IndicatorManagerState(pub Arc<Mutex<IndicatorManager>>);

impl IndicatorManagerState {
    pub fn new(app: AppHandle, candle_store: CandleStoreState) -> Self {
        Self(Arc::new(Mutex::new(IndicatorManager::new(app, candle_store))))
    }
}

impl Clone for IndicatorManagerState {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}

pub fn notify_candles_changed(
    indicator_manager: &IndicatorManagerState,
    symbol: &str,
    timeframe: &str,
    prepended: bool,
) {
    if let Ok(mut guard) = indicator_manager.0.lock() {
        guard.on_candles_changed(symbol, timeframe, prepended);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::model::Candle;
    use crate::indicators::fixtures::sample_candles;

    fn candle(ts: i64, close: f64) -> Candle {
        Candle {
            timestamp: ts,
            open: close,
            high: close + 1.0,
            low: close - 1.0,
            close,
            volume: 1000.0 + ts as f64,
        }
    }

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

    #[test]
    fn integration_sync_after_candles_arrive() {
        let store = CandleStoreState::new();
        let mut mgr = IndicatorManager::new_for_test(store.clone());
        mgr.sync(vec![ma_subscription("chart-1", "ma-1")]);
        assert!(mgr.test_cached_series("chart-1", "ma-1").is_none());

        let candles = sample_candles();
        store
            .0
            .lock()
            .unwrap()
            .replace("BTCUSDT", "1m", candles.clone());
        mgr.on_candles_changed("BTCUSDT", "1m", false);

        let series = mgr.test_cached_series("chart-1", "ma-1").expect("series");
        assert_eq!(series.points.len(), candles.len());
        let last = series.points.last().unwrap();
        assert!((last.values["ma1"].unwrap() - 133.0).abs() < 1e-6);
    }

    #[test]
    fn integration_live_patch_updates_last_bar() {
        let store = CandleStoreState::new();
        let mut mgr = IndicatorManager::new_for_test(store.clone());
        let mut candles = sample_candles();
        store
            .0
            .lock()
            .unwrap()
            .replace("BTCUSDT", "1m", candles.clone());
        mgr.sync(vec![ma_subscription("chart-1", "ma-1")]);

        let before = mgr
            .test_cached_series("chart-1", "ma-1")
            .unwrap()
            .points
            .last()
            .unwrap()
            .clone();

        let mut updated_last = candles.pop().unwrap();
        updated_last.close = 200.0;
        candles.push(updated_last);
        store
            .0
            .lock()
            .unwrap()
            .replace("BTCUSDT", "1m", candles.clone());
        mgr.on_candles_changed("BTCUSDT", "1m", false);

        let after = mgr
            .test_cached_series("chart-1", "ma-1")
            .unwrap()
            .points
            .last()
            .unwrap()
            .clone();
        assert_eq!(after.timestamp, before.timestamp);
        assert!(after.values["ma1"].unwrap() > before.values["ma1"].unwrap());
    }

    #[test]
    fn integration_live_patch_appends_new_bar() {
        let store = CandleStoreState::new();
        let mut mgr = IndicatorManager::new_for_test(store.clone());
        let candles = vec![candle(1, 10.0), candle(2, 20.0), candle(3, 30.0)];
        store
            .0
            .lock()
            .unwrap()
            .replace("BTCUSDT", "1m", candles);
        mgr.sync(vec![ma_subscription("chart-1", "ma-1")]);

        store
            .0
            .lock()
            .unwrap()
            .append_or_update("BTCUSDT", "1m", candle(4, 40.0));
        mgr.on_candles_changed("BTCUSDT", "1m", false);

        let series = mgr.test_cached_series("chart-1", "ma-1").unwrap();
        assert_eq!(series.points.len(), 4);
        assert_eq!(series.points.last().unwrap().timestamp, 4);
        assert!((series.points.last().unwrap().values["ma1"].unwrap() - 30.0).abs() < 1e-6);
    }

    #[test]
    fn integration_prepend_triggers_full_recompute() {
        let store = CandleStoreState::new();
        let mut mgr = IndicatorManager::new_for_test(store.clone());
        store
            .0
            .lock()
            .unwrap()
            .replace("BTCUSDT", "1m", vec![candle(10, 100.0), candle(11, 110.0)]);
        mgr.sync(vec![ma_subscription("chart-1", "ma-1")]);

        store
            .0
            .lock()
            .unwrap()
            .prepend("BTCUSDT", "1m", vec![candle(8, 80.0), candle(9, 90.0)]);
        mgr.on_candles_changed("BTCUSDT", "1m", true);

        let series = mgr.test_cached_series("chart-1", "ma-1").unwrap();
        assert_eq!(series.points.len(), 4);
        assert_eq!(series.points[0].timestamp, 8);
    }
}
