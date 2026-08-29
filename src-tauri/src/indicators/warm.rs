use crate::core::model::Candle;
use crate::core::model::IndicatorPoint;
use crate::indicators::traits::{Indicator, IndicatorState};
use crate::indicators::types::IndicatorError;

pub fn compute_incremental(
    indicator: &dyn Indicator,
    params: &[f64],
    candles: &[Candle],
) -> Result<Vec<IndicatorPoint>, IndicatorError> {
    let mut state = indicator.create_state(params)?;
    Ok(candles
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let prev = if i > 0 { Some(&candles[i - 1]) } else { None };
            state.on_candle(i, c, prev)
        })
        .collect())
}

pub fn warm_state(
    indicator: &dyn Indicator,
    params: &[f64],
    candles: &[Candle],
    end_exclusive: usize,
) -> Result<Box<dyn IndicatorState>, IndicatorError> {
    let mut state = indicator.create_state(params)?;
    for (i, c) in candles[..end_exclusive].iter().enumerate() {
        let prev = if i > 0 { Some(&candles[i - 1]) } else { None };
        let _ = state.on_candle(i, c, prev);
    }
    Ok(state)
}

pub fn apply_candle(
    state: &mut dyn IndicatorState,
    candles: &[Candle],
    index: usize,
) -> IndicatorPoint {
    let prev = if index > 0 {
        Some(&candles[index - 1])
    } else {
        None
    };
    state.on_candle(index, &candles[index], prev)
}
