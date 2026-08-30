use crate::core::model::Candle;
use crate::indicators::incremental::WilderRsiState;
use crate::indicators::traits::{Indicator, IndicatorState};
use crate::indicators::types::{IndicatorError, IndicatorId, IndicatorPoint, IndicatorSeries};
use crate::indicators::warm::compute_series;

pub struct RsiIndicator;

impl Indicator for RsiIndicator {
    fn id(&self) -> IndicatorId {
        IndicatorId::new("RSI")
    }

    fn validate_params(&self, params: &[f64]) -> Result<(), IndicatorError> {
        if params.is_empty() || params.iter().any(|p| *p < 1.0) {
            return Err(IndicatorError::InvalidParams {
                id: "RSI".into(),
                reason: "need at least one period >= 1".into(),
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
        Ok(Box::new(RsiState {
            states: params
                .iter()
                .enumerate()
                .map(|(i, p)| WilderRsiState::new(*p as usize, figure_key(i)))
                .collect(),
        }))
    }
}

#[derive(Clone)]
struct RsiState {
    states: Vec<WilderRsiState>,
}

impl IndicatorState for RsiState {
    fn on_candle(
        &mut self,
        _index: usize,
        candle: &Candle,
        _prev: Option<&Candle>,
    ) -> IndicatorPoint {
        let mut merged = IndicatorPoint::empty(candle.timestamp);
        for state in &mut self.states {
            let pt = state.on_candle(candle.timestamp, candle);
            merged.values.extend(pt.values);
        }
        merged
    }

    fn warmup_len(&self) -> usize {
        self.states.iter().map(|s| s.period()).max().unwrap_or(0)
    }

    fn duplicate(&self) -> Box<dyn IndicatorState> {
        Box::new(self.clone())
    }
}

pub fn figure_key(index: usize) -> String {
    format!("rsi{}", index + 1)
}
