use crate::core::model::{Candle, SymbolInfo};
use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::sync::Mutex;
use std::time::Instant;

const KLINES_URL: &str = "https://api.binance.com/api/v3/klines";
const EXCHANGE_INFO_URL: &str = "https://api.binance.com/api/v3/exchangeInfo";

// process-lifetime cache; upgrade to TTL/disk if exchangeInfo churn matters
static SYMBOLS_CACHE: Mutex<Option<Vec<SymbolInfo>>> = Mutex::new(None);

const KLINES_PAGE_LIMIT: u16 = 1000;

/// Build Binance klines URL. `end_time` is open-time ms (inclusive upper bound).
pub fn klines_url(symbol: &str, interval: &str, limit: u16, end_time: Option<i64>) -> String {
    let limit = limit.clamp(1, KLINES_PAGE_LIMIT);
    let symbol = symbol.to_uppercase();
    let mut url = format!("{KLINES_URL}?symbol={symbol}&interval={interval}&limit={limit}");
    if let Some(t) = end_time {
        url.push_str(&format!("&endTime={t}"));
    }
    url
}

/// Fetch klines from Binance spot REST. Optional `end_time` pages older history.
pub async fn fetch_klines(
    symbol: &str,
    interval: &str,
    limit: u16,
    end_time: Option<i64>,
) -> Result<Vec<Candle>> {
    let url = klines_url(symbol, interval, limit, end_time);
    let symbol = symbol.to_uppercase();

    tracing::info!(%symbol, %interval, limit, ?end_time, "fetching binance klines");

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

    if candles.is_empty() && end_time.is_none() {
        return Err(anyhow!("no klines returned for {symbol} {interval}"));
    }

    Ok(candles)
}

/// Trading symbols from exchangeInfo (cached for process lifetime).
pub async fn fetch_symbols() -> Result<Vec<SymbolInfo>> {
    if let Ok(guard) = SYMBOLS_CACHE.lock() {
        if let Some(cached) = guard.as_ref() {
            return Ok(cached.clone());
        }
    }

    tracing::info!("fetching binance exchangeInfo");
    let started = Instant::now();
    let client = reqwest::Client::new();
    let body: Value = client
        .get(EXCHANGE_INFO_URL)
        .send()
        .await
        .context("binance exchangeInfo request")?
        .error_for_status()
        .context("binance exchangeInfo http status")?
        .json()
        .await
        .context("binance exchangeInfo json")?;

    let symbols = parse_exchange_symbols(&body)?;
    tracing::info!(
        count = symbols.len(),
        elapsed_ms = started.elapsed().as_millis() as u64,
        "parsed exchange symbols"
    );

    if let Ok(mut guard) = SYMBOLS_CACHE.lock() {
        *guard = Some(symbols.clone());
    }

    Ok(symbols)
}

pub fn parse_exchange_symbols(body: &Value) -> Result<Vec<SymbolInfo>> {
    let arr = body
        .get("symbols")
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow!("exchangeInfo missing symbols array"))?;

    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        match parse_symbol_entry(item) {
            Ok(Some(s)) => out.push(s),
            Ok(None) => {}
            Err(e) => tracing::warn!(error = %e, "skip bad symbol entry"),
        }
    }
    out.sort_by(|a, b| a.ticker.cmp(&b.ticker));
    Ok(out)
}

fn parse_symbol_entry(item: &Value) -> Result<Option<SymbolInfo>> {
    let status = item
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if status != "TRADING" {
        return Ok(None);
    }

    let ticker = item
        .get("symbol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("missing symbol"))?
        .to_string();
    let base = item
        .get("baseAsset")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let quote = item
        .get("quoteAsset")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let price_precision = precision_from_filters(item, "PRICE_FILTER", "tickSize")
        .or_else(|| {
            item.get("quoteAssetPrecision")
                .and_then(|v| v.as_i64())
                .map(|n| n as i32)
        })
        .unwrap_or(8);

    let volume_precision = precision_from_filters(item, "LOT_SIZE", "stepSize")
        .or_else(|| {
            item.get("baseAssetPrecision")
                .and_then(|v| v.as_i64())
                .map(|n| n as i32)
        })
        .unwrap_or(8);

    Ok(Some(SymbolInfo {
        ticker,
        base,
        quote,
        price_precision,
        volume_precision,
    }))
}

/// Decimal places implied by a filter size string like "0.00100000".
fn precision_from_filters(item: &Value, filter_type: &str, field: &str) -> Option<i32> {
    let filters = item.get("filters")?.as_array()?;
    for f in filters {
        if f.get("filterType").and_then(|v| v.as_str()) != Some(filter_type) {
            continue;
        }
        let size = f.get(field)?.as_str()?;
        return Some(decimal_places(size));
    }
    None
}

fn decimal_places(size: &str) -> i32 {
    let trimmed = size.trim_end_matches('0');
    if let Some(dot) = trimmed.find('.') {
        let frac = &trimmed[dot + 1..];
        if frac.is_empty() {
            0
        } else {
            frac.len() as i32
        }
    } else {
        0
    }
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
    fn klines_url_without_end_time() {
        let url = klines_url("btcusdt", "1h", 1000, None);
        assert_eq!(
            url,
            "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000"
        );
    }

    #[test]
    fn klines_url_with_end_time() {
        let url = klines_url("ethusdt", "15m", 500, Some(1_700_000_000_000));
        assert_eq!(
            url,
            "https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=15m&limit=500&endTime=1700000000000"
        );
    }

    #[test]
    fn klines_url_clamps_limit() {
        let url = klines_url("BTCUSDT", "1m", 0, None);
        assert!(url.contains("limit=1"));
        let url = klines_url("BTCUSDT", "1m", 9999, None);
        assert!(url.contains("limit=1000"));
    }

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

    #[test]
    fn decimal_places_from_tick() {
        assert_eq!(decimal_places("0.01000000"), 2);
        assert_eq!(decimal_places("0.00100000"), 3);
        assert_eq!(decimal_places("1.00000000"), 0);
    }

    #[test]
    fn parses_exchange_symbols_trading_only() {
        let body = json!({
            "symbols": [
                {
                    "symbol": "ETHUSDT",
                    "status": "TRADING",
                    "baseAsset": "ETH",
                    "quoteAsset": "USDT",
                    "baseAssetPrecision": 8,
                    "quoteAssetPrecision": 8,
                    "filters": [
                        { "filterType": "PRICE_FILTER", "tickSize": "0.01000000" },
                        { "filterType": "LOT_SIZE", "stepSize": "0.00010000" }
                    ]
                },
                {
                    "symbol": "OLDUSDT",
                    "status": "BREAK",
                    "baseAsset": "OLD",
                    "quoteAsset": "USDT",
                    "filters": []
                }
            ]
        });
        let list = parse_exchange_symbols(&body).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].ticker, "ETHUSDT");
        assert_eq!(list[0].price_precision, 2);
        assert_eq!(list[0].volume_precision, 4);
    }
}
