use crate::core::model::Candle;
use crate::indicators::incremental::SmaState;
use crate::indicators::traits::{Indicator, IndicatorState};
use crate::indicators::types::{IndicatorError, IndicatorId, IndicatorPoint, IndicatorSeries};
use crate::indicators::warm::compute_series;

pub struct MaIndicator;

impl Indicator for MaIndicator {
    fn id(&self) -> IndicatorId {
        IndicatorId::new("MA")
    }

    fn validate_params(&self, params: &[f64]) -> Result<(), IndicatorError> {
        if params.is_empty() || params.iter().any(|p| *p < 1.0) {
            return Err(IndicatorError::InvalidParams {
                id: "MA".into(),
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
        Ok(Box::new(MaState {
            states: params
                .iter()
                .enumerate()
                .map(|(i, p)| SmaState::new(*p as usize, figure_key(i)))
                .collect(),
        }))
    }
}

#[derive(Clone)]
struct MaState {
    states: Vec<SmaState>,
}

impl IndicatorState for MaState {
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
    format!("ma{}", index + 1)
}

pub fn figure_keys(count: usize) -> Vec<String> {
    (0..count).map(figure_key).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candle(close: f64) -> Candle {
        Candle {
            timestamp: 0,
            open: close,
            high: close,
            low: close,
            close,
            volume: 1.0,
        }
    }

    #[test]
    fn ma_two_periods() {
        let ind = MaIndicator;
        let data: Vec<_> = (1..=4)
            .map(|i| {
                let mut c = candle(i as f64);
                c.timestamp = i;
                c
            })
            .collect();
        let series = ind.compute_all(&data, &[2.0, 3.0]).unwrap();
        assert_eq!(series.points.len(), 4);
        assert!(series.points[0].values.get("ma1").unwrap().is_none());
        assert!((series.points[1].values["ma1"].unwrap() - 1.5).abs() < 1e-9);
    }
}
