use crate::core::model::Candle;

/// Wilder RSI on close. Returns `None` until `period` gains/losses available.
pub fn rsi(candles: &[Candle], period: usize) -> Vec<Option<f64>> {
    let mut out = vec![None; candles.len()];
    if period == 0 || candles.len() <= period {
        return out;
    }

    let mut avg_gain = 0.0;
    let mut avg_loss = 0.0;
    for i in 1..=period {
        let diff = candles[i].close - candles[i - 1].close;
        if diff >= 0.0 {
            avg_gain += diff;
        } else {
            avg_loss -= diff;
        }
    }
    avg_gain /= period as f64;
    avg_loss /= period as f64;

    out[period] = Some(rsi_from_avgs(avg_gain, avg_loss));

    for i in (period + 1)..candles.len() {
        let diff = candles[i].close - candles[i - 1].close;
        let (gain, loss) = if diff >= 0.0 {
            (diff, 0.0)
        } else {
            (0.0, -diff)
        };
        avg_gain = (avg_gain * (period as f64 - 1.0) + gain) / period as f64;
        avg_loss = (avg_loss * (period as f64 - 1.0) + loss) / period as f64;
        out[i] = Some(rsi_from_avgs(avg_gain, avg_loss));
    }

    out
}

fn rsi_from_avgs(avg_gain: f64, avg_loss: f64) -> f64 {
    if avg_loss == 0.0 {
        return 100.0;
    }
    let rs = avg_gain / avg_loss;
    100.0 - (100.0 / (1.0 + rs))
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
    fn rsi_flat_is_neutral_or_undefined_early() {
        let data: Vec<_> = (0..20).map(|_| candle(100.0)).collect();
        let r = rsi(&data, 14);
        assert!(r[14].is_some());
        // all flat after seed → gain=0 loss=0 → treated as 100 in Wilder edge
        assert!(r[19].unwrap() >= 0.0 && r[19].unwrap() <= 100.0);
    }
}
