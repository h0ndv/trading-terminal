mod commands;

pub mod core;

mod data;

mod events;

pub mod indicators;

pub mod market;



use market::candle_store::CandleStoreState;

use market::indicator_manager::IndicatorManagerState;

use market::stream_manager::StreamManagerState;

use market::ticker_manager::TickerManagerState;

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

            let candle_store = CandleStoreState::new();

            let indicator_manager =

                IndicatorManagerState::new(handle.clone(), candle_store.clone());

            app.manage(candle_store.clone());

            app.manage(indicator_manager.clone());

            app.manage(StreamManagerState::new(

                handle.clone(),

                candle_store,

                indicator_manager,

            ));

            app.manage(TickerManagerState::new(handle));

            Ok(())

        })

        .invoke_handler(tauri::generate_handler![

            commands::get_historical,

            commands::list_symbols,

            commands::sync_chart_streams,

            commands::sync_ticker_symbols,

            commands::sync_indicator_subscriptions,

        ])

        .run(tauri::generate_context!())

        .expect("error while running tauri application");

}

