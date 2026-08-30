use crate::data::binance::{
    bootstrap_market_panel, run_combined_market_panel_stream, run_market_panel_stream,
};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::AppHandle;
use tokio::sync::watch;

pub struct MarketPanelManager {
    app: AppHandle,
    active_symbols: HashSet<String>,
    cancel_tx: Option<watch::Sender<bool>>,
}

impl MarketPanelManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            active_symbols: HashSet::new(),
            cancel_tx: None,
        }
    }

    pub fn sync(&mut self, symbols: Vec<String>) {
        let desired: HashSet<String> = symbols
            .into_iter()
            .map(|s| s.to_uppercase())
            .filter(|s| !s.is_empty())
            .collect();

        if desired == self.active_symbols {
            return;
        }

        self.stop_stream();
        self.active_symbols = desired.clone();

        if desired.is_empty() {
            tracing::info!("market panel symbols cleared");
            return;
        }

        let (cancel_tx, cancel_rx) = watch::channel(false);
        self.cancel_tx = Some(cancel_tx);

        let app = self.app.clone();
        let syms: Vec<String> = desired.into_iter().collect();
        tauri::async_runtime::spawn(async move {
            bootstrap_market_panel(&syms, &app).await;
            if syms.len() == 1 {
                run_market_panel_stream(&syms[0], app, cancel_rx).await;
            } else {
                run_combined_market_panel_stream(syms, app, cancel_rx).await;
            }
        });

        tracing::info!(count = self.active_symbols.len(), "market panel synced");
    }

    fn stop_stream(&mut self) {
        if let Some(tx) = self.cancel_tx.take() {
            let _ = tx.send(true);
        }
    }
}

pub struct MarketPanelManagerState(pub Mutex<MarketPanelManager>);

impl MarketPanelManagerState {
    pub fn new(app: AppHandle) -> Self {
        Self(Mutex::new(MarketPanelManager::new(app)))
    }
}
