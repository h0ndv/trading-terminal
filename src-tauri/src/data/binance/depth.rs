use crate::core::model::{BookLevel, OrderBookSnapshot};
use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::Value;

const DEPTH_URL: &str = "https://api.binance.com/api/v3/depth";

#[derive(Debug, Deserialize)]
struct DepthRest {
    #[serde(rename = "lastUpdateId")]
    last_update_id: u64,
    bids: Vec<(String, String)>,
    asks: Vec<(String, String)>,
}

#[derive(Debug, Deserialize, Default)]
struct DepthWsRaw {
    #[serde(rename = "lastUpdateId", default)]
    last_update_id: Option<u64>,
    #[serde(default)]
    u: Option<u64>,
    #[serde(default)]
    bids: Vec<(String, String)>,
    #[serde(default)]
    asks: Vec<(String, String)>,
    #[serde(default, rename = "b")]
    b: Vec<(String, String)>,
    #[serde(default, rename = "a")]
    a: Vec<(String, String)>,
}

impl DepthWsRaw {
    fn update_id(&self) -> u64 {
        self.last_update_id.or(self.u).unwrap_or(0)
    }

    fn bid_rows(&self) -> &[(String, String)] {
        if !self.bids.is_empty() {
            &self.bids
        } else {
            &self.b
        }
    }

    fn ask_rows(&self) -> &[(String, String)] {
        if !self.asks.is_empty() {
            &self.asks
        } else {
            &self.a
        }
    }
}

fn parse_levels(rows: &[(String, String)]) -> Result<Vec<BookLevel>> {
    rows.iter()
        .map(|(price, qty)| {
            Ok(BookLevel {
                price: price.parse().context("parse book price")?,
                qty: qty.parse().context("parse book qty")?,
            })
        })
        .collect()
}

pub fn snapshot_from_depth_value(symbol: &str, data: &Value) -> Result<OrderBookSnapshot> {
    let raw: DepthWsRaw = serde_json::from_value(data.clone()).context("parse depth ws payload")?;
    let bids = parse_levels(raw.bid_rows())?;
    let asks = parse_levels(raw.ask_rows())?;
    if bids.is_empty() && asks.is_empty() {
        anyhow::bail!("depth ws payload has no bid or ask levels");
    }
    Ok(OrderBookSnapshot {
        symbol: symbol.to_uppercase(),
        bids,
        asks,
        update_id: raw.update_id(),
    })
}

pub async fn fetch_depth(symbol: &str, limit: u16) -> Result<OrderBookSnapshot> {
    let symbol = symbol.to_uppercase();
    let url = format!("{DEPTH_URL}?symbol={symbol}&limit={limit}");
    tracing::info!(%symbol, limit, "fetching binance depth");

    let client = reqwest::Client::new();
    let row: DepthRest = client
        .get(&url)
        .send()
        .await
        .context("binance depth request")?
        .error_for_status()
        .context("binance depth http status")?
        .json()
        .await
        .context("binance depth json")?;

    Ok(OrderBookSnapshot {
        symbol,
        bids: parse_levels(&row.bids)?,
        asks: parse_levels(&row.asks)?,
        update_id: row.last_update_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEPTH_SPOT_FIXTURE: &str = r#"{
        "lastUpdateId": 1027024,
        "bids": [["67000.00", "1.5"], ["66999.00", "2.0"]],
        "asks": [["67001.00", "0.8"], ["67002.00", "1.2"]]
    }"#;

    const DEPTH_FUTURES_FIXTURE: &str = r#"{
        "e": "depthUpdate",
        "E": 123456789,
        "T": 123456788,
        "s": "ETHUSDT",
        "U": 157,
        "u": 160,
        "pu": 149,
        "b": [["2500.00", "10.5"]],
        "a": [["2501.00", "8.2"]]
    }"#;

    #[test]
    fn parses_spot_depth_ws() {
        let data: Value = serde_json::from_str(DEPTH_SPOT_FIXTURE).unwrap();
        let snap = snapshot_from_depth_value("BTCUSDT", &data).unwrap();
        assert_eq!(snap.symbol, "BTCUSDT");
        assert_eq!(snap.bids.len(), 2);
        assert_eq!(snap.asks.len(), 2);
        assert!((snap.bids[0].price - 67000.0).abs() < f64::EPSILON);
        assert_eq!(snap.update_id, 1027024);
    }

    #[test]
    fn parses_futures_depth_ws() {
        let data: Value = serde_json::from_str(DEPTH_FUTURES_FIXTURE).unwrap();
        let snap = snapshot_from_depth_value("ETHUSDT", &data).unwrap();
        assert_eq!(snap.symbol, "ETHUSDT");
        assert_eq!(snap.bids.len(), 1);
        assert_eq!(snap.asks.len(), 1);
        assert!((snap.bids[0].price - 2500.0).abs() < f64::EPSILON);
        assert_eq!(snap.update_id, 160);
    }
}
