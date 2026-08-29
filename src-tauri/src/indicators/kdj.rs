use crate::core::model::Candle;
use crate::indicators::traits::{Indicator, IndicatorState};
use crate::indicators::types::{IndicatorError, IndicatorId, IndicatorPoint, IndicatorSeries};
use std::collections::HashMap;

pub struct KdjIndicator;

impl Indicator for KdjIndicator {
    fn id(&self) -> IndicatorId {
        IndicatorId::new("KDJ")
    }

    fn validate_params(&self, params: &[f64]) -> Result<(), IndicatorError> {
        if params.len() < 3 || params.iter().any(|p| *p < 1.0) {
            return Err(IndicatorError::InvalidParams {
                id: "KDJ".into(),
                reason: "need [rsv, k, d] >= 1".into(),
            });
        }
        Ok(())
    }

    fn compute_all(&self, candles: &[Candle], params: &[f64]) -> IndicatorSeries {
        let rsv_period = params[0] as usize;
        let k_smooth = params[1] as usize;
        let d_smooth = params[2] as usize;
        let mut state = KdjState::new(rsv_period, k_smooth, d_smooth);
        let points = candles
            .iter()
            .enumerate()
            .map(|(i, c)| state.on_candle(i, c, None))
            .collect();
        IndicatorSeries {
            indicator_id: "KDJ".into(),
            calc_params: params.to_vec(),
            points,
        }
    }

    fn create_state(&self, params: &[f64]) -> Result<Box<dyn IndicatorState>, IndicatorError> {
        self.validate_params(params)?;
        Ok(Box::new(KdjState::new(
            params[0] as usize,
            params[1] as usize,
            params[2] as usize,
        )))
    }
}

pub struct KdjState {
    rsv_period: usize,
    k_smooth: usize,
    d_smooth: usize,
    highs: Vec<f64>,
    lows: Vec<f64>,
    k: f64,
    d: f64,
    seeded: bool,
}

impl KdjState {
    fn new(rsv_period: usize, k_smooth: usize, d_smooth: usize) -> Self {
        Self {
            rsv_period,
            k_smooth,
            d_smooth,
            highs: Vec::new(),
            lows: Vec::new(),
            k: 50.0,
            d: 50.0,
            seeded: false,
        }
    }

    fn rsv(&self, close: f64) -> Option<f64> {
        if self.highs.len() < self.rsv_period {
            return None;
        }
        let high = self
            .highs
            .iter()
            .rev()
            .take(self.rsv_period)
            .copied()
            .fold(f64::NEG_INFINITY, f64::max);
        let low = self
            .lows
            .iter()
            .rev()
            .take(self.rsv_period)
            .copied()
            .fold(f64::INFINITY, f64::min);
        if (high - low).abs() < f64::EPSILON {
            return Some(50.0);
        }
        Some((close - low) / (high - low) * 100.0)
    }
}

impl IndicatorState for KdjState {
    fn on_candle(
        &mut self,
        _index: usize,
        candle: &Candle,
        _prev: Option<&Candle>,
    ) -> IndicatorPoint {
        self.highs.push(candle.high);
        self.lows.push(candle.low);
        let mut values = HashMap::new();
        let rsv = self.rsv(candle.close);
        if let Some(rsv) = rsv {
            if !self.seeded {
                self.k = rsv;
                self.d = rsv;
                self.seeded = true;
            } else {
                let k_alpha = 1.0 / self.k_smooth as f64;
                let d_alpha = 1.0 / self.d_smooth as f64;
                self.k = k_alpha * rsv + (1.0 - k_alpha) * self.k;
                self.d = d_alpha * self.k + (1.0 - d_alpha) * self.d;
            }
            let j = 3.0 * self.k - 2.0 * self.d;
            values.insert("k".into(), Some(self.k));
            values.insert("d".into(), Some(self.d));
            values.insert("j".into(), Some(j));
        } else {
            values.insert("k".into(), None);
            values.insert("d".into(), None);
            values.insert("j".into(), None);
        }
        IndicatorPoint {
            timestamp: candle.timestamp,
            values,
        }
    }

    fn warmup_len(&self) -> usize {
        self.rsv_period
    }
}
