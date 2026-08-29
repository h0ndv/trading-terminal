use crate::core::model::Candle;
use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use serde::Deserialize;
use std::time::Duration;
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StreamConfig {
    pub symbol: String,
    pub interval: String,
}

impl StreamConfig {
    pub fn new(symbol: impl Into<String>, interval: impl Into<String>) -> Self {
        Self {
            symbol: symbol.into(),
            interval: interval.into(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct KlineEvent {
    k: KlinePayload,
}

#[derive(Debug, Deserialize)]
struct KlinePayload {
    t: i64,
    o: String,
    h: String,
    l: String,
    c: String,
    v: String,
    #[serde(default)]
    x: bool,
}

fn stream_url(cfg: &StreamConfig) -> String {
    let sym = cfg.symbol.to_lowercase();
    format!(
        "wss://stream.binance.com:9443/ws/{sym}@kline_{}",
        cfg.interval
    )
}

fn parse_candle(k: &KlinePayload) -> Result<Candle> {
    Ok(Candle {
        timestamp: k.t,
        open: k.o.parse().context("parse open")?,
        high: k.h.parse().context("parse high")?,
        low: k.l.parse().context("parse low")?,
        close: k.c.parse().context("parse close")?,
        volume: k.v.parse().context("parse volume")?,
    })
}

enum StopReason {
    Cancelled,
    Closed,
}

/// Run kline stream for a single key; reconnects until cancelled.
pub async fn run_kline_stream(
    cfg: StreamConfig,
    tx: mpsc::Sender<Candle>,
    mut cancel_rx: watch::Receiver<bool>,
) {
    let mut backoff_secs: u64 = 1;
    const MAX_BACKOFF: u64 = 30;

    loop {
        if *cancel_rx.borrow() {
            tracing::info!(
                symbol = %cfg.symbol,
                interval = %cfg.interval,
                "kline stream cancelled"
            );
            return;
        }

        let url = stream_url(&cfg);
        tracing::info!(
            symbol = %cfg.symbol,
            interval = %cfg.interval,
            %url,
            "starting binance ws"
        );

        match connect_and_read(&url, &tx, &mut cancel_rx).await {
            Ok(StopReason::Cancelled) => return,
            Ok(StopReason::Closed) => {
                tracing::warn!(
                    symbol = %cfg.symbol,
                    interval = %cfg.interval,
                    "binance ws closed cleanly; reconnecting"
                );
                backoff_secs = 1;
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    symbol = %cfg.symbol,
                    interval = %cfg.interval,
                    backoff_secs,
                    "binance ws error; reconnecting"
                );
            }
        }

        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF);
    }
}

async fn connect_and_read(
    url: &str,
    tx: &mpsc::Sender<Candle>,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<StopReason> {
    tracing::info!(%url, "connecting to binance ws");
    let (ws, _) = connect_async(url).await.context("binance ws connect")?;
    tracing::info!("binance ws connected");
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
                    Some(Ok(Message::Text(text))) => match serde_json::from_str::<KlineEvent>(&text) {
                        Ok(ev) => {
                            if ev.k.x {
                                tracing::trace!(ts = ev.k.t, "kline closed");
                            }
                            match parse_candle(&ev.k) {
                                Ok(candle) => {
                                    if tx.send(candle).await.is_err() {
                                        return Err(anyhow!("candle channel closed"));
                                    }
                                }
                                Err(e) => tracing::warn!(error = %e, "failed to parse kline fields"),
                            }
                        }
                        Err(e) => tracing::warn!(error = %e, "failed to deserialize kline event"),
                    },
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => return Ok(StopReason::Closed),
                    Some(Ok(Message::Binary(_) | Message::Frame(_))) => {}
                }
            }
        }
    }
}
