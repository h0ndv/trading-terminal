mod commands;
mod core;
mod data;
mod events;
mod indicators;

use data::binance;
use events::emit_candle;
use tokio::sync::mpsc;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![commands::get_historical])
        .setup(|app| {
            let handle = app.handle().clone();
            let (tx, mut rx) = mpsc::channel(256);

            tauri::async_runtime::spawn(async move {
                binance::run_stream(tx).await;
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
