use crate::data::binance::depth::snapshot_from_depth_value;
use crate::data::binance::trade::{parse_trade, TradeWs};
use crate::events::{emit_book_update, emit_trade_update};
use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::watch;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const DEPTH_LEVELS: u16 = 20;

pub fn combined_market_panel_url(symbol: &str) -> String {
    combined_market_panel_stream_url(&[symbol.to_string()])
}

pub fn combined_market_panel_stream_url(symbols: &[String]) -> String {
    combined_market_panel_stream_url_for_market(symbols, false)
}

pub fn combined_futures_market_panel_stream_url(symbols: &[String]) -> String {
    combined_market_panel_stream_url_for_market(symbols, true)
}

fn combined_market_panel_stream_url_for_market(symbols: &[String], futures: bool) -> String {
    let mut streams: Vec<String> = Vec::with_capacity(symbols.len() * 2);
    for symbol in symbols {
        let sym = symbol.to_lowercase();
        streams.push(format!("{sym}@depth{DEPTH_LEVELS}@100ms"));
        if !futures {
            streams.push(format!("{sym}@trade"));
        }
    }
    let joined = streams.join("/");
    if futures {
        format!("wss://fstream.binance.com/stream?streams={joined}")
    } else {
        format!("wss://stream.binance.com:9443/stream?streams={joined}")
    }
}

fn symbol_from_stream(stream: &str) -> Option<String> {
    let head = stream.split('@').next()?;
    if head.is_empty() {
        return None;
    }
    Some(head.to_uppercase())
}

#[derive(Debug, Deserialize)]
struct CombinedStreamEnvelope<T> {
    stream: String,
    data: T,
}

enum StopReason {
    Cancelled,
    Closed,
}

pub async fn run_market_panel_stream(
    symbol: &str,
    app: AppHandle,
    mut cancel_rx: watch::Receiver<bool>,
) {
    let symbol = symbol.to_uppercase();
    let mut backoff_secs: u64 = 1;
    const MAX_BACKOFF: u64 = 30;

    loop {
        if *cancel_rx.borrow() {
            tracing::info!(%symbol, "market panel stream cancelled");
            return;
        }

        let url = combined_market_panel_url(&symbol);
        tracing::info!(%symbol, %url, "starting binance market panel ws");

        match connect_and_read_single(&symbol, &url, &app, &mut cancel_rx).await {
            Ok(StopReason::Cancelled) => return,
            Ok(StopReason::Closed) => {
                tracing::warn!(%symbol, "market panel ws closed cleanly; reconnecting");
                backoff_secs = 1;
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    %symbol,
                    backoff_secs,
                    "market panel ws error; reconnecting"
                );
            }
        }

        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF);
    }
}

pub async fn run_combined_market_panel_stream(
    symbols: Vec<String>,
    app: AppHandle,
    cancel_rx: watch::Receiver<bool>,
) {
    run_combined_market_panel_stream_for_market(symbols, app, cancel_rx, false).await;
}

pub async fn run_combined_futures_market_panel_stream(
    symbols: Vec<String>,
    app: AppHandle,
    cancel_rx: watch::Receiver<bool>,
) {
    run_combined_market_panel_stream_for_market(symbols, app, cancel_rx, true).await;
}

async fn run_combined_market_panel_stream_for_market(
    symbols: Vec<String>,
    app: AppHandle,
    cancel_rx: watch::Receiver<bool>,
    futures: bool,
) {
    let mut cancel_rx = cancel_rx;
    let count = symbols.len();
    let mut backoff_secs: u64 = 1;
    const MAX_BACKOFF: u64 = 30;

    loop {
        if *cancel_rx.borrow() {
            tracing::info!(count, "combined market panel stream cancelled");
            return;
        }

        let url = if futures {
            combined_futures_market_panel_stream_url(&symbols)
        } else {
            combined_market_panel_stream_url(&symbols)
        };
        tracing::info!(count, %url, "starting binance combined market panel ws");

        match connect_and_read_combined(&url, &app, &mut cancel_rx).await {
            Ok(StopReason::Cancelled) => return,
            Ok(StopReason::Closed) => {
                tracing::warn!(
                    count,
                    "combined market panel ws closed cleanly; reconnecting"
                );
                backoff_secs = 1;
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    count,
                    backoff_secs,
                    "combined market panel ws error; reconnecting"
                );
            }
        }

        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF);
    }
}

async fn connect_and_read_single(
    symbol: &str,
    url: &str,
    app: &AppHandle,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<StopReason> {
    let (ws, _) = connect_async(url)
        .await
        .context("binance market panel ws connect")?;
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
                        dispatch_message_single(symbol, &text, app);
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
        .context("binance combined market panel ws connect")?;
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
                        dispatch_message_combined(&text, app);
                    }
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => return Ok(StopReason::Closed),
                    Some(Ok(Message::Binary(_) | Message::Frame(_))) => {}
                }
            }
        }
    }
}

fn dispatch_message_single(symbol: &str, text: &str, app: &AppHandle) {
    if text.contains("@trade") {
        match serde_json::from_str::<CombinedStreamEnvelope<TradeWs>>(text) {
            Ok(ev) => match parse_trade(&ev.data) {
                Ok(tick) => emit_trade_update(app, &tick),
                Err(e) => tracing::warn!(error = %e, "failed to parse trade tick"),
            },
            Err(e) => tracing::warn!(error = %e, "failed to deserialize trade event"),
        }
        return;
    }

    if text.contains("@depth") {
        match serde_json::from_str::<CombinedStreamEnvelope<Value>>(text) {
            Ok(ev) => match snapshot_from_depth_value(symbol, &ev.data) {
                Ok(book) => emit_book_update(app, &book),
                Err(e) => tracing::debug!(error = %e, %symbol, "failed to parse depth snapshot"),
            },
            Err(e) => tracing::debug!(error = %e, %symbol, "failed to deserialize depth event"),
        }
    }
}

fn dispatch_message_combined(text: &str, app: &AppHandle) {
    if text.contains("@trade") {
        match serde_json::from_str::<CombinedStreamEnvelope<TradeWs>>(text) {
            Ok(ev) => match parse_trade(&ev.data) {
                Ok(tick) => emit_trade_update(app, &tick),
                Err(e) => tracing::warn!(error = %e, "failed to parse combined trade tick"),
            },
            Err(e) => tracing::warn!(error = %e, "failed to deserialize combined trade event"),
        }
        return;
    }

    if text.contains("@depth") {
        match serde_json::from_str::<CombinedStreamEnvelope<Value>>(text) {
            Ok(ev) => {
                let Some(symbol) = symbol_from_stream(&ev.stream) else {
                    tracing::warn!(stream = %ev.stream, "combined depth missing symbol");
                    return;
                };
                match snapshot_from_depth_value(&symbol, &ev.data) {
                    Ok(book) => emit_book_update(app, &book),
                    Err(e) => tracing::debug!(error = %e, %symbol, "failed to parse combined depth"),
                }
            }
            Err(e) => tracing::debug!(error = %e, "failed to deserialize combined depth event"),
        }
    }
}

pub async fn bootstrap_market_panel(symbols: &[String], app: &AppHandle) {
    let bootstrap = symbols.iter().map(|symbol| {
        let symbol = symbol.to_uppercase();
        let app = app.clone();
        async move {
            match crate::data::binance::fetch_depth(&symbol, DEPTH_LEVELS).await {
                Ok(book) => emit_book_update(&app, &book),
                Err(e) => tracing::error!(error = %e, %symbol, "depth REST bootstrap failed"),
            }
        }
    });
    futures_util::future::join_all(bootstrap).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_single_symbol_market_panel_url() {
        let url = combined_market_panel_url("BTCUSDT");
        assert!(url.contains("btcusdt@depth20@100ms"));
        assert!(url.contains("btcusdt@trade"));
    }

    #[test]
    fn builds_combined_market_panel_url() {
        let url = combined_market_panel_stream_url(&["BTCUSDT".into(), "ETHUSDT".into()]);
        assert!(url.contains("btcusdt@depth20@100ms"));
        assert!(url.contains("btcusdt@trade"));
        assert!(url.contains("ethusdt@depth20@100ms"));
        assert!(url.contains("ethusdt@trade"));
    }

    #[test]
    fn parses_symbol_from_stream_name() {
        assert_eq!(
            symbol_from_stream("btcusdt@depth20@100ms").as_deref(),
            Some("BTCUSDT")
        );
        assert_eq!(
            symbol_from_stream("ethusdt@trade").as_deref(),
            Some("ETHUSDT")
        );
    }
}
