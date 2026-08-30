use crate::core::model::Candle;
use crate::indicators::incremental::EmaState;
use crate::indicators::traits::{Indicator, IndicatorState};
use crate::indicators::types::{IndicatorError, IndicatorId, IndicatorPoint, IndicatorSeries};
use crate::indicators::warm::compute_series;
use std::collections::HashMap;

pub struct MacdIndicator;

impl Indicator for MacdIndicator {
    fn id(&self) -> IndicatorId {
        IndicatorId::new("MACD")
    }

    fn validate_params(&self, params: &[f64]) -> Result<(), IndicatorError> {
        if params.len() < 3 || params.iter().any(|p| *p < 1.0) {
            return Err(IndicatorError::InvalidParams {
                id: "MACD".into(),
                reason: "need [fast, slow, signal] >= 1".into(),
            });
        }
        Ok(())
    }

    fn compute_all(
        &self,
        candles: &[Candle],
        params: &[f64],
    ) -> Result<IndicatorSeries, IndicatorError> {
        compute_series(self, params, candles)
    }

    fn create_state(&self, params: &[f64]) -> Result<Box<dyn IndicatorState>, IndicatorError> {
        self.validate_params(params)?;
        Ok(Box::new(MacdState::new(
            params[0] as usize,
            params[1] as usize,
            params[2] as usize,
        )))
    }
}

#[derive(Clone)]
struct MacdState {
    ema_fast: EmaState,
    ema_slow: EmaState,
    ema_signal: EmaState,
}

impl MacdState {
    fn new(fast: usize, slow: usize, signal: usize) -> Self {
        Self {
            ema_fast: EmaState::new(fast, "fast"),
            ema_slow: EmaState::new(slow, "slow"),
            ema_signal: EmaState::new(signal, "dea"),
        }
    }
}

impl IndicatorState for MacdState {
    fn on_candle(
        &mut self,
        _index: usize,
        candle: &Candle,
        _prev: Option<&Candle>,
    ) -> IndicatorPoint {
        let _ = self.ema_fast.on_value(candle.timestamp, candle.close);
        let _ = self.ema_slow.on_value(candle.timestamp, candle.close);
        let fast_v = self.ema_fast.last_value();
        let slow_v = self.ema_slow.last_value();
        let mut values = HashMap::new();
        let dif = match (fast_v, slow_v) {
            (Some(f), Some(s)) => Some(f - s),
            _ => None,
        };
        values.insert("dif".into(), dif);
        let dea = if let Some(d) = dif {
            self.ema_signal
                .on_value(candle.timestamp, d)
                .values
                .get("dea")
                .copied()
                .flatten()
        } else {
            None
        };
        values.insert("dea".into(), dea);
        let macd = match (dif, dea) {
            (Some(d), Some(e)) => Some((d - e) * 2.0),
            _ => None,
        };
        values.insert("macd".into(), macd);
        IndicatorPoint {
            timestamp: candle.timestamp,
            values,
        }
    }

    fn warmup_len(&self) -> usize {
        self.ema_slow.period() + self.ema_signal.period()
    }

    fn duplicate(&self) -> Box<dyn IndicatorState> {
        Box::new(self.clone())
    }
}
