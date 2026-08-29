use crate::core::model::Candle;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const MAX_CANDLES_PER_KEY: usize = 10_000;

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

    pub fn replace(&mut self, symbol: &str, timeframe: &str, candles: Vec<Candle>) {
        let key = CandleKey::new(symbol, timeframe);
        let mut sorted = candles;
        sorted.sort_by_key(|c| c.timestamp);
        dedupe_sorted(&mut sorted);
        trim_tail(&mut sorted);
        self.series.insert(key, sorted);
    }

    pub fn prepend(&mut self, symbol: &str, timeframe: &str, candles: Vec<Candle>) -> bool {
        if candles.is_empty() {
            return false;
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
            return false;
        }
        merged.append(existing);
        dedupe_sorted(&mut merged);
        trim_tail(&mut merged);
        *existing = merged;
        true
    }

    pub fn append_or_update(&mut self, symbol: &str, timeframe: &str, candle: Candle) -> usize {
        let key = CandleKey::new(symbol, timeframe);
        let series = self.series.entry(key).or_default();
        if let Some(last) = series.last_mut() {
            if last.timestamp == candle.timestamp {
                *last = candle;
                return series.len() - 1;
            }
            if last.timestamp > candle.timestamp {
                if let Some(idx) = series.iter().position(|c| c.timestamp == candle.timestamp) {
                    series[idx] = candle;
                    return idx;
                }
                let pos = series.partition_point(|c| c.timestamp < candle.timestamp);
                series.insert(pos, candle);
                trim_tail(series);
                return pos;
            }
        }
        series.push(candle);
        trim_tail(series);
        series.len() - 1
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

fn trim_tail(candles: &mut Vec<Candle>) {
    if candles.len() > MAX_CANDLES_PER_KEY {
        let drop = candles.len() - MAX_CANDLES_PER_KEY;
        candles.drain(0..drop);
    }
}

pub struct CandleStoreState(pub Arc<Mutex<CandleStore>>);

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
        store.replace("btcusdt", "1m", vec![candle(2, 2.0), candle(1, 1.0)]);
        let snap = store.snapshot("BTCUSDT", "1m");
        assert_eq!(snap.len(), 2);
        assert_eq!(snap[0].timestamp, 1);
    }

    #[test]
    fn append_or_update_same_timestamp() {
        let mut store = CandleStore::new();
        store.replace("BTCUSDT", "1m", vec![candle(1, 1.0)]);
        store.append_or_update("BTCUSDT", "1m", candle(1, 1.5));
        let snap = store.snapshot("BTCUSDT", "1m");
        assert_eq!(snap.len(), 1);
        assert!((snap[0].close - 1.5).abs() < f64::EPSILON);
    }

    #[test]
    fn prepend_older_candles() {
        let mut store = CandleStore::new();
        store.replace("BTCUSDT", "1m", vec![candle(10, 10.0), candle(11, 11.0)]);
        assert!(store.prepend("BTCUSDT", "1m", vec![candle(8, 8.0), candle(9, 9.0)]));
        let snap = store.snapshot("BTCUSDT", "1m");
        assert_eq!(snap.len(), 4);
        assert_eq!(snap[0].timestamp, 8);
    }
}
