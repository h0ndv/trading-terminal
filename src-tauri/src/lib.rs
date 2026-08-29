mod commands;
mod core;
mod data;
mod events;
mod indicators;
mod market;

use market::stream_manager::StreamManagerState;
use tauri::Manager;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(StreamManagerState::new(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_historical,
            commands::list_symbols,
            commands::sync_chart_streams,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
