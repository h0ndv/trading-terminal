use crate::core::model::Candle;
use crate::indicators::incremental::EmaState;
use crate::indicators::traits::{Indicator, IndicatorState};
use crate::indicators::types::{IndicatorError, IndicatorId, IndicatorPoint, IndicatorSeries};
use crate::indicators::warm::compute_series;

pub struct EmaIndicator;

impl Indicator for EmaIndicator {
    fn id(&self) -> IndicatorId {
        IndicatorId::new("EMA")
    }

    fn validate_params(&self, params: &[f64]) -> Result<(), IndicatorError> {
        if params.is_empty() || params.iter().any(|p| *p < 1.0) {
            return Err(IndicatorError::InvalidParams {
                id: "EMA".into(),
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
        Ok(Box::new(EmaStateWrapper {
            states: params
                .iter()
                .enumerate()
                .map(|(i, p)| EmaState::new(*p as usize, figure_key(i)))
                .collect(),
        }))
    }
}

#[derive(Clone)]
struct EmaStateWrapper {
    states: Vec<EmaState>,
}

impl IndicatorState for EmaStateWrapper {
    fn on_candle(
        &mut self,
        _index: usize,
        candle: &Candle,
        _prev: Option<&Candle>,
    ) -> IndicatorPoint {
        let mut merged = IndicatorPoint::empty(candle.timestamp);
        for state in &mut self.states {
            let pt = state.on_value(candle.timestamp, candle.close);
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
    format!("ema{}", index + 1)
}
