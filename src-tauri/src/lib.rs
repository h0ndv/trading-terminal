mod commands;
mod core;
mod data;
mod events;
mod indicators;

use data::binance::{self, StreamConfig};
use events::emit_candle;
use tokio::sync::{mpsc, watch};
use tracing_subscriber::EnvFilter;

const DEFAULT_SYMBOL: &str = "BTCUSDT";
const DEFAULT_INTERVAL: &str = "1m";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let initial = StreamConfig::new(DEFAULT_SYMBOL, DEFAULT_INTERVAL);
    let (config_tx, config_rx) = watch::channel(initial);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(config_tx)
        .invoke_handler(tauri::generate_handler![
            commands::get_historical,
            commands::list_symbols,
            commands::set_stream
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let (tx, mut rx) = mpsc::channel(256);

            tauri::async_runtime::spawn(async move {
                binance::run_stream(config_rx, tx).await;
            });

            tauri::async_runtime::spawn(async move {
                while let Some(candle) = rx.recv().await {
                    emit_candle(&handle, &candle);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
