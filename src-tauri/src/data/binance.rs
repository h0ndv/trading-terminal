use crate::core::model::Candle;
use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use serde::Deserialize;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const WS_URL: &str = "wss://stream.binance.com:9443/ws/btcusdt@kline_1m";

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

/// Connect to Binance kline stream and forward candles. Reconnects with backoff on failure.
pub async fn run_stream(tx: mpsc::Sender<Candle>) {
    let mut backoff_secs: u64 = 1;
    const MAX_BACKOFF: u64 = 30;

    loop {
        match connect_and_read(&tx).await {
            Ok(()) => {
                tracing::warn!("binance ws closed cleanly; reconnecting");
                backoff_secs = 1;
            }
            Err(e) => {
                tracing::error!(error = %e, backoff_secs, "binance ws error; reconnecting");
            }
        }

        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF);
    }
}

async fn connect_and_read(tx: &mpsc::Sender<Candle>) -> Result<()> {
    tracing::info!(url = WS_URL, "connecting to binance ws");
    let (ws, _) = connect_async(WS_URL)
        .await
        .context("binance ws connect")?;
    tracing::info!("binance ws connected");
    let (_, mut read) = ws.split();

    while let Some(msg) = read.next().await {
        let msg = msg.context("ws read")?;
        match msg {
            Message::Text(text) => match serde_json::from_str::<KlineEvent>(&text) {
                Ok(ev) => match parse_candle(&ev.k) {
                    Ok(candle) => {
                        if tx.send(candle).await.is_err() {
                            return Err(anyhow!("candle channel closed"));
                        }
                    }
                    Err(e) => tracing::warn!(error = %e, "failed to parse kline fields"),
                },
                Err(e) => tracing::warn!(error = %e, "failed to deserialize kline event"),
            },
            Message::Ping(_) | Message::Pong(_) => {}
            Message::Close(_) => return Ok(()),
            Message::Binary(_) | Message::Frame(_) => {}
        }
    }

    Ok(())
}
