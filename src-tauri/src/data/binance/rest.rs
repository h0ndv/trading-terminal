use crate::core::model::Candle;
use anyhow::{anyhow, Context, Result};
use serde_json::Value;

const KLINES_URL: &str = "https://api.binance.com/api/v3/klines";

/// Fetch recent klines from Binance spot REST.
pub async fn fetch_klines(symbol: &str, interval: &str, limit: u16) -> Result<Vec<Candle>> {
    let limit = limit.clamp(1, 1000);
    let symbol = symbol.to_uppercase();
    let url = format!(
        "{KLINES_URL}?symbol={symbol}&interval={interval}&limit={limit}"
    );

    tracing::info!(%symbol, %interval, limit, "fetching binance klines");

    let client = reqwest::Client::new();
    let rows: Vec<Value> = client
        .get(&url)
        .send()
        .await
        .context("binance klines request")?
        .error_for_status()
        .context("binance klines http status")?
        .json()
        .await
        .context("binance klines json")?;

    let mut candles = Vec::with_capacity(rows.len());
    for (i, row) in rows.iter().enumerate() {
        match parse_kline_row(row) {
            Ok(c) => candles.push(c),
            Err(e) => tracing::warn!(index = i, error = %e, "skip bad kline row"),
        }
    }

    if candles.is_empty() {
        return Err(anyhow!("no klines returned for {symbol} {interval}"));
    }

    Ok(candles)
}

/// Parse one Binance kline array row into a Candle.
pub fn parse_kline_row(row: &Value) -> Result<Candle> {
    let arr = row
        .as_array()
        .ok_or_else(|| anyhow!("kline row is not an array"))?;
    if arr.len() < 6 {
        return Err(anyhow!("kline row too short"));
    }

    let timestamp = arr[0]
        .as_i64()
        .ok_or_else(|| anyhow!("open time not i64"))?;
    let open: f64 = arr[1]
        .as_str()
        .ok_or_else(|| anyhow!("open not str"))?
        .parse()
        .context("parse open")?;
    let high: f64 = arr[2]
        .as_str()
        .ok_or_else(|| anyhow!("high not str"))?
        .parse()
        .context("parse high")?;
    let low: f64 = arr[3]
        .as_str()
        .ok_or_else(|| anyhow!("low not str"))?
        .parse()
        .context("parse low")?;
    let close: f64 = arr[4]
        .as_str()
        .ok_or_else(|| anyhow!("close not str"))?
        .parse()
        .context("parse close")?;
    let volume: f64 = arr[5]
        .as_str()
        .ok_or_else(|| anyhow!("volume not str"))?
        .parse()
        .context("parse volume")?;

    Ok(Candle {
        timestamp,
        open,
        high,
        low,
        close,
        volume,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_kline_row() {
        let row = json!([
            1_499_040_000_000_i64,
            "0.01634790",
            "0.80000000",
            "0.01575800",
            "0.01577100",
            "148976.11427815",
            1_499_644_799_999_i64,
            "2434.19055334",
            308,
            "1756.87402314",
            "28.46694368",
            "0"
        ]);
        let c = parse_kline_row(&row).unwrap();
        assert_eq!(c.timestamp, 1_499_040_000_000);
        assert!((c.open - 0.01634790).abs() < 1e-9);
        assert!((c.close - 0.01577100).abs() < 1e-9);
        assert!((c.volume - 148976.11427815).abs() < 1e-6);
    }
}
