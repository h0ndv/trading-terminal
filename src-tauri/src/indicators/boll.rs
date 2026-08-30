use crate::core::model::Candle;
use crate::indicators::traits::{Indicator, IndicatorState};
use crate::indicators::types::{IndicatorError, IndicatorId, IndicatorPoint, IndicatorSeries};
use crate::indicators::warm::compute_series;
use std::collections::HashMap;
use std::collections::VecDeque;

pub struct BollIndicator;

impl Indicator for BollIndicator {
    fn id(&self) -> IndicatorId {
        IndicatorId::new("BOLL")
    }

    fn validate_params(&self, params: &[f64]) -> Result<(), IndicatorError> {
        if params.len() < 2 || params[0] < 1.0 || params[1] <= 0.0 {
            return Err(IndicatorError::InvalidParams {
                id: "BOLL".into(),
                reason: "need [period>=1, mult>0]".into(),
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
        Ok(Box::new(BollState {
            period: params[0] as usize,
            mult: params[1],
            window: VecDeque::new(),
        }))
    }
}

#[derive(Clone)]
struct BollState {
    period: usize,
    mult: f64,
    window: VecDeque<f64>,
}

impl IndicatorState for BollState {
    fn on_candle(
        &mut self,
        _index: usize,
        candle: &Candle,
        _prev: Option<&Candle>,
    ) -> IndicatorPoint {
        self.window.push_back(candle.close);
        if self.window.len() > self.period {
            self.window.pop_front();
        }
        let mut values = HashMap::new();
        if self.window.len() < self.period {
            values.insert("mid".into(), None);
            values.insert("upper".into(), None);
            values.insert("lower".into(), None);
            return IndicatorPoint {
                timestamp: candle.timestamp,
                values,
            };
        }
        let mid: f64 = self.window.iter().sum::<f64>() / self.period as f64;
        let variance = self
            .window
            .iter()
            .map(|c| {
                let d = c - mid;
                d * d
            })
            .sum::<f64>()
            / self.period as f64;
        let std = variance.sqrt();
        values.insert("mid".into(), Some(mid));
        values.insert("upper".into(), Some(mid + self.mult * std));
        values.insert("lower".into(), Some(mid - self.mult * std));
        IndicatorPoint {
            timestamp: candle.timestamp,
            values,
        }
    }

    fn warmup_len(&self) -> usize {
        self.period
    }

    fn duplicate(&self) -> Box<dyn IndicatorState> {
        Box::new(self.clone())
    }
}
