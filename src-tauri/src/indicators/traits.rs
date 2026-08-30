use crate::core::model::{Candle, IndicatorPoint, IndicatorSeries};
use crate::indicators::types::{IndicatorError, IndicatorId};

pub trait Indicator: Send + Sync {
    fn id(&self) -> IndicatorId;
    fn validate_params(&self, params: &[f64]) -> Result<(), IndicatorError>;
    fn compute_all(
        &self,
        candles: &[Candle],
        params: &[f64],
    ) -> Result<IndicatorSeries, IndicatorError>;
    fn create_state(&self, params: &[f64]) -> Result<Box<dyn IndicatorState>, IndicatorError>;
}

pub trait IndicatorState: Send {
    fn on_candle(&mut self, index: usize, candle: &Candle, prev: Option<&Candle>)
        -> IndicatorPoint;
    fn warmup_len(&self) -> usize;
    fn duplicate(&self) -> Box<dyn IndicatorState>;
}
