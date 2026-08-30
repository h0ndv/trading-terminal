use crate::core::model::TradeTick;
use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TradeWs {
    s: String,
    p: String,
    q: String,
    #[serde(rename = "T")]
    trade_time: i64,
    m: bool,
}

pub fn parse_trade(row: &TradeWs) -> Result<TradeTick> {
    Ok(TradeTick {
        symbol: row.s.clone(),
        price: row.p.parse().context("parse trade price")?,
        qty: row.q.parse().context("parse trade qty")?,
        time: row.trade_time,
        is_buyer_maker: row.m,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const TRADE_FIXTURE: &str = r#"{
        "e": "trade",
        "E": 123456789,
        "s": "BTCUSDT",
        "t": 12345,
        "p": "67000.50",
        "q": "0.001",
        "T": 123456785,
        "m": true
    }"#;

    #[test]
    fn parses_trade_ws() {
        let row: TradeWs = serde_json::from_str(TRADE_FIXTURE).unwrap();
        let tick = parse_trade(&row).unwrap();
        assert_eq!(tick.symbol, "BTCUSDT");
        assert!((tick.price - 67000.50).abs() < f64::EPSILON);
        assert!((tick.qty - 0.001).abs() < f64::EPSILON);
        assert_eq!(tick.time, 123456785);
        assert!(tick.is_buyer_maker);
    }
}
