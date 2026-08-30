use crate::core::model::Candle;
use crate::market::candle_change::CandleChange;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub(crate) const MAX_CANDLES_PER_KEY: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CandleKey {
    pub symbol: String,
    pub timeframe: String,
}

impl CandleKey {
    pub fn new(symbol: &str, timeframe: &str) -> Self {
        Self {
            symbol: symbol.to_uppercase(),
            timeframe: timeframe.to_string(),
        }
    }
}

#[derive(Debug, Default)]
pub struct CandleStore {
    series: HashMap<CandleKey, Vec<Candle>>,
}

impl CandleStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn replace(&mut self, symbol: &str, timeframe: &str, candles: Vec<Candle>) -> CandleChange {
        let key = CandleKey::new(symbol, timeframe);
        let mut sorted = candles;
        sorted.sort_by_key(|c| c.timestamp);
        dedupe_sorted(&mut sorted);
        trim_tail(&mut sorted);
        self.series.insert(key, sorted);
        CandleChange::Replace
    }

    pub fn prepend(
        &mut self,
        symbol: &str,
        timeframe: &str,
        candles: Vec<Candle>,
    ) -> Option<CandleChange> {
        if candles.is_empty() {
            return None;
        }
        let key = CandleKey::new(symbol, timeframe);
        let existing = self.series.entry(key).or_default();
        let mut merged = candles;
        merged.sort_by_key(|c| c.timestamp);
        dedupe_sorted(&mut merged);
        if let Some(first_existing) = existing.first() {
            merged.retain(|c| c.timestamp < first_existing.timestamp);
        }
        if merged.is_empty() {
            return None;
        }
        let count = merged.len();
        merged.append(existing);
        dedupe_sorted(&mut merged);
        trim_tail(&mut merged);
        *existing = merged;
        Some(CandleChange::Prepend { count })
    }

    pub fn append_or_update(
        &mut self,
        symbol: &str,
        timeframe: &str,
        candle: Candle,
    ) -> CandleChange {
        let key = CandleKey::new(symbol, timeframe);
        let series = self.series.entry(key).or_default();
        if let Some(last) = series.last_mut() {
            if last.timestamp == candle.timestamp {
                *last = candle;
                return CandleChange::PatchLast;
            }
            if last.timestamp > candle.timestamp {
                if let Some(idx) = series.iter().position(|c| c.timestamp == candle.timestamp) {
                    series[idx] = candle;
                    return CandleChange::PatchLast;
                }
                let pos = series.partition_point(|c| c.timestamp < candle.timestamp);
                series.insert(pos, candle);
                let dropped = trim_tail(series);
                return if dropped > 0 {
                    CandleChange::TrimHead { dropped }
                } else {
                    CandleChange::PatchLast
                };
            }
        }
        series.push(candle);
        let dropped = trim_tail(series);
        if dropped > 0 {
            CandleChange::TrimHead { dropped }
        } else {
            CandleChange::PatchLast
        }
    }

    pub fn snapshot(&self, symbol: &str, timeframe: &str) -> Arc<[Candle]> {
        let key = CandleKey::new(symbol, timeframe);
        self.series
            .get(&key)
            .map(|v| v.as_slice().into())
            .unwrap_or_else(|| Arc::from([]))
    }

    pub fn len(&self, symbol: &str, timeframe: &str) -> usize {
        let key = CandleKey::new(symbol, timeframe);
        self.series.get(&key).map(|v| v.len()).unwrap_or(0)
    }
}

fn dedupe_sorted(candles: &mut Vec<Candle>) {
    candles.dedup_by_key(|c| c.timestamp);
}

fn trim_tail(candles: &mut Vec<Candle>) -> usize {
    if candles.len() > MAX_CANDLES_PER_KEY {
        let drop = candles.len() - MAX_CANDLES_PER_KEY;
        candles.drain(0..drop);
        drop
    } else {
        0
    }
}

pub struct CandleStoreState(pub Arc<Mutex<CandleStore>>);

impl Default for CandleStoreState {
    fn default() -> Self {
        Self::new()
    }
}

impl CandleStoreState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(CandleStore::new())))
    }
}

impl Clone for CandleStoreState {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candle(ts: i64, close: f64) -> Candle {
        Candle {
            timestamp: ts,
            open: close,
            high: close,
            low: close,
            close,
            volume: 1.0,
        }
    }

    #[test]
    fn replace_and_snapshot() {
        let mut store = CandleStore::new();
        assert_eq!(
            store.replace("btcusdt", "1m", vec![candle(2, 2.0), candle(1, 1.0)]),
            CandleChange::Replace
        );
        let snap = store.snapshot("BTCUSDT", "1m");
        assert_eq!(snap.len(), 2);
        assert_eq!(snap[0].timestamp, 1);
    }

    #[test]
    fn append_or_update_same_timestamp() {
        let mut store = CandleStore::new();
        store.replace("BTCUSDT", "1m", vec![candle(1, 1.0)]);
        assert_eq!(
            store.append_or_update("BTCUSDT", "1m", candle(1, 1.5)),
            CandleChange::PatchLast
        );
        let snap = store.snapshot("BTCUSDT", "1m");
        assert_eq!(snap.len(), 1);
        assert!((snap[0].close - 1.5).abs() < f64::EPSILON);
    }

    #[test]
    fn prepend_older_candles() {
        let mut store = CandleStore::new();
        store.replace("BTCUSDT", "1m", vec![candle(10, 10.0), candle(11, 11.0)]);
        assert_eq!(
            store.prepend("BTCUSDT", "1m", vec![candle(8, 8.0), candle(9, 9.0)]),
            Some(CandleChange::Prepend { count: 2 })
        );
        let snap = store.snapshot("BTCUSDT", "1m");
        assert_eq!(snap.len(), 4);
        assert_eq!(snap[0].timestamp, 8);
    }

    #[test]
    fn prepend_empty_returns_none() {
        let mut store = CandleStore::new();
        store.replace("BTCUSDT", "1m", vec![candle(1, 1.0)]);
        assert!(store.prepend("BTCUSDT", "1m", vec![]).is_none());
    }

    #[test]
    fn append_or_update_out_of_order() {
        let mut store = CandleStore::new();
        store.replace("BTCUSDT", "1m", vec![candle(1, 1.0), candle(3, 3.0)]);
        assert_eq!(
            store.append_or_update("BTCUSDT", "1m", candle(2, 2.0)),
            CandleChange::PatchLast
        );
        let snap = store.snapshot("BTCUSDT", "1m");
        assert_eq!(snap.len(), 3);
        assert_eq!(snap[1].timestamp, 2);
    }

    #[test]
    fn trim_head_on_overflow() {
        let mut store = CandleStore::new();
        let candles: Vec<_> = (0..MAX_CANDLES_PER_KEY as i64)
            .map(|i| candle(i, i as f64))
            .collect();
        store.replace("BTCUSDT", "1m", candles);
        assert_eq!(
            store.append_or_update("BTCUSDT", "1m", candle(MAX_CANDLES_PER_KEY as i64, 1.0)),
            CandleChange::TrimHead { dropped: 1 }
        );
        assert_eq!(store.len("BTCUSDT", "1m"), MAX_CANDLES_PER_KEY);
    }
}
