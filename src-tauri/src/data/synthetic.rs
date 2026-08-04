use crate::core::model::Candle;

/// Generate synthetic OHLCV candles (deterministic LCG walk).
pub fn generate(count: usize, start_price: f64, interval_ms: i64) -> Vec<Candle> {
    let count = count.clamp(200, 500);
    let now = chrono::Utc::now().timestamp_millis();
    let start_ts = now - (count as i64) * interval_ms;

    let mut candles = Vec::with_capacity(count);
    let mut price = start_price;
    // ponytail: LCG is enough for synthetic demo charts; upgrade to rand if you need statistical noise
    let mut state: u64 = 0xDEAD_BEEF_CAFE_BABE;

    for i in 0..count {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1);
        let n = (state >> 33) as f64 / (u32::MAX as f64);
        let change = (n - 0.5) * 0.004; // ±0.2%
        let open = price;
        let close = (open * (1.0 + change)).max(1.0);
        let high = open.max(close) * (1.0 + n * 0.001);
        let low = open.min(close) * (1.0 - (1.0 - n) * 0.001);
        let volume = 50.0 + n * 450.0;

        candles.push(Candle {
            timestamp: start_ts + (i as i64) * interval_ms,
            open,
            high,
            low,
            close,
            volume,
        });
        price = close;
    }

    candles
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_clamped_count() {
        let c = generate(10, 100.0, 60_000);
        assert!(c.len() >= 200);
        let c2 = generate(1000, 100.0, 60_000);
        assert!(c2.len() <= 500);
    }
}
