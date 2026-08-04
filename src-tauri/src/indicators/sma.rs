use crate::core::model::Candle;

/// Simple moving average of close prices. Returns `None` until enough samples.
pub fn sma(candles: &[Candle], period: usize) -> Vec<Option<f64>> {
    if period == 0 {
        return vec![None; candles.len()];
    }
    let mut out = Vec::with_capacity(candles.len());
    let mut sum = 0.0;
    for (i, c) in candles.iter().enumerate() {
        sum += c.close;
        if i + 1 < period {
            out.push(None);
        } else {
            if i >= period {
                sum -= candles[i - period].close;
            }
            out.push(Some(sum / period as f64));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::model::Candle;

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
    fn sma_3() {
        let data = [1.0, 2.0, 3.0, 4.0].map(candle);
        let r = sma(&data, 3);
        assert_eq!(r[0], None);
        assert_eq!(r[1], None);
        assert!((r[2].unwrap() - 2.0).abs() < 1e-9);
        assert!((r[3].unwrap() - 3.0).abs() < 1e-9);
    }
}
