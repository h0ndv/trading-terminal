use crate::core::model::Candle;
use crate::core::model::IndicatorPoint;
use std::collections::HashMap;

pub struct SmaState {
    period: usize,
    key: String,
    window: Vec<f64>,
    sum: f64,
}

impl SmaState {
    pub fn period(&self) -> usize {
        self.period
    }

    pub fn new(period: usize, key: impl Into<String>) -> Self {
        Self {
            period,
            key: key.into(),
            window: Vec::new(),
            sum: 0.0,
        }
    }

    pub fn on_value(&mut self, timestamp: i64, value: f64) -> IndicatorPoint {
        let mut values = HashMap::new();
        if self.period == 0 {
            values.insert(self.key.clone(), None);
            return IndicatorPoint { timestamp, values };
        }
        self.window.push(value);
        self.sum += value;
        if self.window.len() > self.period {
            self.sum -= self.window.remove(0);
        }
        let v = if self.window.len() >= self.period {
            Some(self.sum / self.period as f64)
        } else {
            None
        };
        values.insert(self.key.clone(), v);
        IndicatorPoint { timestamp, values }
    }
}

pub struct EmaState {
    period: usize,
    key: String,
    alpha: f64,
    seeded: bool,
    ema: f64,
    seed_sum: f64,
    seed_count: usize,
    last: Option<f64>,
}

impl EmaState {
    pub fn period(&self) -> usize {
        self.period
    }

    pub fn last_value(&self) -> Option<f64> {
        self.last
    }

    pub fn new(period: usize, key: impl Into<String>) -> Self {
        Self {
            period,
            key: key.into(),
            alpha: 2.0 / (period as f64 + 1.0),
            seeded: false,
            ema: 0.0,
            seed_sum: 0.0,
            seed_count: 0,
            last: None,
        }
    }

    pub fn on_value(&mut self, timestamp: i64, value: f64) -> IndicatorPoint {
        let mut values = HashMap::new();
        if self.period == 0 {
            values.insert(self.key.clone(), None);
            return IndicatorPoint { timestamp, values };
        }
        let v = if !self.seeded {
            self.seed_sum += value;
            self.seed_count += 1;
            if self.seed_count >= self.period {
                self.ema = self.seed_sum / self.period as f64;
                self.seeded = true;
                Some(self.ema)
            } else {
                None
            }
        } else {
            self.ema = self.alpha * value + (1.0 - self.alpha) * self.ema;
            Some(self.ema)
        };
        self.last = v;
        values.insert(self.key.clone(), v);
        IndicatorPoint { timestamp, values }
    }
}

pub struct WilderRsiState {
    period: usize,
    key: String,
    avg_gain: f64,
    avg_loss: f64,
    seeded: bool,
    prev_close: Option<f64>,
    seed_gains: f64,
    seed_losses: f64,
    seed_count: usize,
}

impl WilderRsiState {
    pub fn period(&self) -> usize {
        self.period
    }

    pub fn new(period: usize, key: impl Into<String>) -> Self {
        Self {
            period,
            key: key.into(),
            avg_gain: 0.0,
            avg_loss: 0.0,
            seeded: false,
            prev_close: None,
            seed_gains: 0.0,
            seed_losses: 0.0,
            seed_count: 0,
        }
    }

    pub fn on_candle(&mut self, timestamp: i64, candle: &Candle) -> IndicatorPoint {
        let mut values = HashMap::new();
        if self.period == 0 {
            values.insert(self.key.clone(), None);
            self.prev_close = Some(candle.close);
            return IndicatorPoint { timestamp, values };
        }
        let Some(prev) = self.prev_close else {
            self.prev_close = Some(candle.close);
            values.insert(self.key.clone(), None);
            return IndicatorPoint { timestamp, values };
        };
        let diff = candle.close - prev;
        self.prev_close = Some(candle.close);
        let (gain, loss) = if diff >= 0.0 {
            (diff, 0.0)
        } else {
            (0.0, -diff)
        };
        let v = if !self.seeded {
            self.seed_gains += gain;
            self.seed_losses += loss;
            self.seed_count += 1;
            if self.seed_count >= self.period {
                self.avg_gain = self.seed_gains / self.period as f64;
                self.avg_loss = self.seed_losses / self.period as f64;
                self.seeded = true;
                Some(rsi_from_avgs(self.avg_gain, self.avg_loss))
            } else {
                None
            }
        } else {
            let p = self.period as f64;
            self.avg_gain = (self.avg_gain * (p - 1.0) + gain) / p;
            self.avg_loss = (self.avg_loss * (p - 1.0) + loss) / p;
            Some(rsi_from_avgs(self.avg_gain, self.avg_loss))
        };
        values.insert(self.key.clone(), v);
        IndicatorPoint { timestamp, values }
    }
}

pub fn rsi_from_avgs(avg_gain: f64, avg_loss: f64) -> f64 {
    if avg_loss == 0.0 {
        return 100.0;
    }
    let rs = avg_gain / avg_loss;
    100.0 - 100.0 / (1.0 + rs)
}

pub fn typical_price(candle: &Candle) -> f64 {
    (candle.high + candle.low + candle.close) / 3.0
}
