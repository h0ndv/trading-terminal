use crate::core::model::Candle;
use crate::indicators::incremental::typical_price;
use crate::indicators::traits::{Indicator, IndicatorState};
use crate::indicators::types::{IndicatorError, IndicatorId, IndicatorPoint, IndicatorSeries};
use std::collections::HashMap;

pub struct CciIndicator;

impl Indicator for CciIndicator {
    fn id(&self) -> IndicatorId {
        IndicatorId::new("CCI")
    }

    fn validate_params(&self, params: &[f64]) -> Result<(), IndicatorError> {
        if params.is_empty() || params[0] < 1.0 {
            return Err(IndicatorError::InvalidParams {
                id: "CCI".into(),
                reason: "need period >= 1".into(),
            });
        }
        Ok(())
    }

    fn compute_all(&self, candles: &[Candle], params: &[f64]) -> IndicatorSeries {
        let period = params[0] as usize;
        let tps: Vec<f64> = candles.iter().map(typical_price).collect();
        let points = candles
            .iter()
            .enumerate()
            .map(|(i, c)| cci_point(&tps, i, period, c.timestamp))
            .collect();
        IndicatorSeries {
            indicator_id: "CCI".into(),
            calc_params: params.to_vec(),
            points,
        }
    }

    fn create_state(&self, params: &[f64]) -> Result<Box<dyn IndicatorState>, IndicatorError> {
        self.validate_params(params)?;
        Ok(Box::new(CciState {
            period: params[0] as usize,
            window: Vec::new(),
        }))
    }
}

fn cci_point(tps: &[f64], index: usize, period: usize, timestamp: i64) -> IndicatorPoint {
    let mut values = HashMap::new();
    if period == 0 || index + 1 < period {
        values.insert("cci".into(), None);
        return IndicatorPoint { timestamp, values };
    }
    let slice = &tps[index + 1 - period..=index];
    let sma: f64 = slice.iter().sum::<f64>() / period as f64;
    let md = slice.iter().map(|tp| (tp - sma).abs()).sum::<f64>() / period as f64;
    let cci = if md == 0.0 {
        0.0
    } else {
        (tps[index] - sma) / (0.015 * md)
    };
    values.insert("cci".into(), Some(cci));
    IndicatorPoint { timestamp, values }
}

struct CciState {
    period: usize,
    window: Vec<f64>,
}

impl IndicatorState for CciState {
    fn on_candle(
        &mut self,
        _index: usize,
        candle: &Candle,
        _prev: Option<&Candle>,
    ) -> IndicatorPoint {
        let tp = typical_price(candle);
        self.window.push(tp);
        if self.window.len() > self.period {
            self.window.remove(0);
        }
        let mut values = HashMap::new();
        if self.window.len() < self.period {
            values.insert("cci".into(), None);
            return IndicatorPoint {
                timestamp: candle.timestamp,
                values,
            };
        }
        let sma: f64 = self.window.iter().sum::<f64>() / self.period as f64;
        let md = self
            .window
            .iter()
            .map(|v| (v - sma).abs())
            .sum::<f64>()
            / self.period as f64;
        let cci = if md == 0.0 {
            0.0
        } else {
            (tp - sma) / (0.015 * md)
        };
        values.insert("cci".into(), Some(cci));
        IndicatorPoint {
            timestamp: candle.timestamp,
            values,
        }
    }

    fn warmup_len(&self) -> usize {
        self.period
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cci_flat_is_zero() {
        let ind = CciIndicator;
        let candles: Vec<Candle> = (0..25)
            .map(|i| Candle {
                timestamp: i,
                open: 10.0,
                high: 10.0,
                low: 10.0,
                close: 10.0,
                volume: 1.0,
            })
            .collect();
        let series = ind.compute_all(&candles, &[20.0]);
        let last = series.points.last().unwrap().values["cci"].unwrap();
        assert!(last.abs() < 1e-9);
    }
}
