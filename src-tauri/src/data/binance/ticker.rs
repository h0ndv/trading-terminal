use crate::core::model::TickerStats;
use crate::events::emit_ticker_update;
use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde::Deserialize;
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::watch;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const TICKER_24H_URL: &str = "https://api.binance.com/api/v3/ticker/24hr";

#[derive(Debug, Deserialize)]
struct Ticker24hrRest {
    symbol: String,
    #[serde(rename = "lastPrice")]
    last_price: String,
    #[serde(rename = "priceChange")]
    price_change: String,
    #[serde(rename = "priceChangePercent")]
    price_change_percent: String,
    #[serde(rename = "highPrice")]
    high_price: String,
    #[serde(rename = "lowPrice")]
    low_price: String,
    volume: String,
    #[serde(rename = "quoteVolume")]
    quote_volume: String,
}

#[derive(Debug, Deserialize)]
struct Ticker24hrWs {
    s: String,
    c: String,
    p: String,
    #[serde(rename = "P")]
    price_change_percent: String,
    h: String,
    l: String,
    v: String,
    q: String,
}

fn ticker_stream_url(symbol: &str) -> String {
    let sym = symbol.to_lowercase();
    format!("wss://stream.binance.com:9443/ws/{sym}@ticker")
}

fn combined_ticker_stream_url(symbols: &[String]) -> String {
    let streams: Vec<String> = symbols
        .iter()
        .map(|s| format!("{}@ticker", s.to_lowercase()))
        .collect();
    format!(
        "wss://stream.binance.com:9443/stream?streams={}",
        streams.join("/")
    )
}

#[derive(Debug, Deserialize)]
struct CombinedTicker24hrWs {
    data: Ticker24hrWs,
}

fn parse_ticker_fields(
    symbol: String,
    last_price: &str,
    price_change: &str,
    price_change_percent: &str,
    high_price: &str,
    low_price: &str,
    volume: &str,
    quote_volume: &str,
) -> Result<TickerStats> {
    Ok(TickerStats {
        symbol,
        last_price: last_price.parse().context("parse last_price")?,
        price_change: price_change.parse().context("parse price_change")?,
        price_change_percent: price_change_percent
            .parse()
            .context("parse price_change_percent")?,
        high_price: high_price.parse().context("parse high_price")?,
        low_price: low_price.parse().context("parse low_price")?,
        volume: volume.parse().context("parse volume")?,
        quote_volume: quote_volume.parse().context("parse quote_volume")?,
    })
}

fn parse_rest(row: &Ticker24hrRest) -> Result<TickerStats> {
    parse_ticker_fields(
        row.symbol.clone(),
        &row.last_price,
        &row.price_change,
        &row.price_change_percent,
        &row.high_price,
        &row.low_price,
        &row.volume,
        &row.quote_volume,
    )
}

fn parse_ws(row: &Ticker24hrWs) -> Result<TickerStats> {
    parse_ticker_fields(
        row.s.clone(),
        &row.c,
        &row.p,
        &row.price_change_percent,
        &row.h,
        &row.l,
        &row.v,
        &row.q,
    )
}

pub async fn fetch_ticker_24h(symbol: &str) -> Result<TickerStats> {
    let symbol = symbol.to_uppercase();
    let url = format!("{TICKER_24H_URL}?symbol={symbol}");
    tracing::info!(%symbol, "fetching binance 24h ticker");

    let client = reqwest::Client::new();
    let row: Ticker24hrRest = client
        .get(&url)
        .send()
        .await
        .context("binance ticker request")?
        .error_for_status()
        .context("binance ticker http status")?
        .json()
        .await
        .context("binance ticker json")?;

    parse_rest(&row)
}

enum StopReason {
    Cancelled,
    Closed,
}

pub async fn run_ticker_stream(
    symbol: &str,
    app: AppHandle,
    mut cancel_rx: watch::Receiver<bool>,
) {
    let symbol = symbol.to_uppercase();
    let mut backoff_secs: u64 = 1;
    const MAX_BACKOFF: u64 = 30;

    loop {
        if *cancel_rx.borrow() {
            tracing::info!(%symbol, "ticker stream cancelled");
            return;
        }

        let url = ticker_stream_url(&symbol);
        tracing::info!(%symbol, %url, "starting binance ticker ws");

        match connect_and_read_single(&url, &app, &mut cancel_rx).await {
            Ok(StopReason::Cancelled) => return,
            Ok(StopReason::Closed) => {
                tracing::warn!(%symbol, "binance ticker ws closed cleanly; reconnecting");
                backoff_secs = 1;
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    %symbol,
                    backoff_secs,
                    "binance ticker ws error; reconnecting"
                );
            }
        }

        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF);
    }
}

pub async fn run_combined_ticker_stream(
    symbols: Vec<String>,
    app: AppHandle,
    mut cancel_rx: watch::Receiver<bool>,
) {
    let count = symbols.len();
    let mut backoff_secs: u64 = 1;
    const MAX_BACKOFF: u64 = 30;

    loop {
        if *cancel_rx.borrow() {
            tracing::info!(count, "combined ticker stream cancelled");
            return;
        }

        let url = combined_ticker_stream_url(&symbols);
        tracing::info!(count, %url, "starting binance combined ticker ws");

        match connect_and_read_combined(&url, &app, &mut cancel_rx).await {
            Ok(StopReason::Cancelled) => return,
            Ok(StopReason::Closed) => {
                tracing::warn!(count, "binance combined ticker ws closed cleanly; reconnecting");
                backoff_secs = 1;
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    count,
                    backoff_secs,
                    "binance combined ticker ws error; reconnecting"
                );
            }
        }

        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF);
    }
}

async fn connect_and_read_single(
    url: &str,
    app: &AppHandle,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<StopReason> {
    let (ws, _) = connect_async(url)
        .await
        .context("binance ticker ws connect")?;
    let (_, mut read) = ws.split();

    loop {
        tokio::select! {
            changed = cancel_rx.changed() => {
                if changed.is_err() || *cancel_rx.borrow() {
                    return Ok(StopReason::Cancelled);
                }
            }
            msg = read.next() => {
                match msg {
                    None => return Ok(StopReason::Closed),
                    Some(Err(e)) => return Err(e.into()),
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<Ticker24hrWs>(&text) {
                            Ok(ev) => match parse_ws(&ev) {
                                Ok(stats) => emit_ticker_update(app, &stats),
                                Err(e) => tracing::warn!(error = %e, "failed to parse ticker fields"),
                            },
                            Err(e) => tracing::warn!(error = %e, "failed to deserialize ticker event"),
                        }
                    }
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => return Ok(StopReason::Closed),
                    Some(Ok(Message::Binary(_) | Message::Frame(_))) => {}
                }
            }
        }
    }
}

async fn connect_and_read_combined(
    url: &str,
    app: &AppHandle,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<StopReason> {
    let (ws, _) = connect_async(url)
        .await
        .context("binance combined ticker ws connect")?;
    let (_, mut read) = ws.split();

    loop {
        tokio::select! {
            changed = cancel_rx.changed() => {
                if changed.is_err() || *cancel_rx.borrow() {
                    return Ok(StopReason::Cancelled);
                }
            }
            msg = read.next() => {
                match msg {
                    None => return Ok(StopReason::Closed),
                    Some(Err(e)) => return Err(e.into()),
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<CombinedTicker24hrWs>(&text) {
                            Ok(ev) => match parse_ws(&ev.data) {
                                Ok(stats) => emit_ticker_update(app, &stats),
                                Err(e) => tracing::warn!(error = %e, "failed to parse combined ticker fields"),
                            },
                            Err(e) => tracing::warn!(error = %e, "failed to deserialize combined ticker event"),
                        }
                    }
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => return Ok(StopReason::Closed),
                    Some(Ok(Message::Binary(_) | Message::Frame(_))) => {}
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REST_FIXTURE: &str = r#"{
        "symbol": "BTCUSDT",
        "priceChange": "100.50",
        "priceChangePercent": "0.150",
        "lastPrice": "67000.25",
        "highPrice": "67500.00",
        "lowPrice": "66000.00",
        "volume": "12345.678",
        "quoteVolume": "820000000.12"
    }"#;

    const WS_FIXTURE: &str = r#"{
        "e": "24hrTicker",
        "s": "ETHUSDT",
        "c": "3500.10",
        "p": "-25.50",
        "P": "-0.723",
        "h": "3600.00",
        "l": "3400.00",
        "v": "50000.5",
        "q": "175000000.0"
    }"#;

    #[test]
    fn parses_rest_ticker() {
        let row: Ticker24hrRest = serde_json::from_str(REST_FIXTURE).unwrap();
        let stats = parse_rest(&row).unwrap();
        assert_eq!(stats.symbol, "BTCUSDT");
        assert!((stats.last_price - 67000.25).abs() < f64::EPSILON);
        assert!((stats.price_change_percent - 0.15).abs() < f64::EPSILON);
        assert!((stats.quote_volume - 820000000.12).abs() < 0.01);
    }

    #[test]
    fn parses_ws_ticker() {
        let row: Ticker24hrWs = serde_json::from_str(WS_FIXTURE).unwrap();
        let stats = parse_ws(&row).unwrap();
        assert_eq!(stats.symbol, "ETHUSDT");
        assert!((stats.last_price - 3500.10).abs() < f64::EPSILON);
        assert!((stats.price_change - -25.50).abs() < f64::EPSILON);
    }

    #[test]
    fn parses_combined_ws_ticker() {
        let fixture = format!(r#"{{"stream":"ethusdt@ticker","data":{WS_FIXTURE}}}"#);
        let row: CombinedTicker24hrWs = serde_json::from_str(&fixture).unwrap();
        let stats = parse_ws(&row.data).unwrap();
        assert_eq!(stats.symbol, "ETHUSDT");
        assert!((stats.last_price - 3500.10).abs() < f64::EPSILON);
    }

    #[test]
    fn builds_combined_ticker_url() {
        let url = combined_ticker_stream_url(&["BTCUSDT".into(), "ETHUSDT".into()]);
        assert!(url.contains("btcusdt@ticker"));
        assert!(url.contains("ethusdt@ticker"));
    }
}
