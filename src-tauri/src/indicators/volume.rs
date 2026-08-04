use crate::core::model::Candle;

/// Extract volume series (passthrough helper for domain consumers).
pub fn volume(candles: &[Candle]) -> Vec<f64> {
    candles.iter().map(|c| c.volume).collect()
}

/// SMA of volume.
pub fn volume_sma(candles: &[Candle], period: usize) -> Vec<Option<f64>> {
    if period == 0 {
        return vec![None; candles.len()];
    }
    let mut out = Vec::with_capacity(candles.len());
    let mut sum = 0.0;
    for (i, c) in candles.iter().enumerate() {
        sum += c.volume;
        if i + 1 < period {
            out.push(None);
        } else {
            if i >= period {
                sum -= candles[i - period].volume;
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

    fn candle(volume: f64) -> Candle {
        Candle {
            timestamp: 0,
            open: 1.0,
            high: 1.0,
            low: 1.0,
            close: 1.0,
            volume,
        }
    }

    #[test]
    fn volume_passthrough() {
        let data = [candle(10.0), candle(20.0)];
        assert_eq!(volume(&data), vec![10.0, 20.0]);
    }
}
