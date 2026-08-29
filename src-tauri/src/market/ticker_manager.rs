use crate::data::binance;
use crate::events::emit_ticker_update;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::AppHandle;
use tokio::sync::watch;

pub struct TickerManager {
    app: AppHandle,
    active_symbols: HashSet<String>,
    cancel_tx: Option<watch::Sender<bool>>,
}

impl TickerManager {
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
            tracing::info!("ticker symbols cleared");
            return;
        }

        let (cancel_tx, cancel_rx) = watch::channel(false);
        self.cancel_tx = Some(cancel_tx);

        let app = self.app.clone();
        let syms: Vec<String> = desired.into_iter().collect();
        tauri::async_runtime::spawn(async move {
            let bootstrap = syms.iter().map(|symbol| {
                let symbol = symbol.clone();
                let app = app.clone();
                async move {
                    match binance::fetch_ticker_24h(&symbol).await {
                        Ok(stats) => emit_ticker_update(&app, &stats),
                        Err(e) => {
                            tracing::error!(error = %e, %symbol, "ticker REST bootstrap failed")
                        }
                    }
                }
            });
            futures_util::future::join_all(bootstrap).await;

            if syms.len() == 1 {
                binance::run_ticker_stream(&syms[0], app, cancel_rx).await;
            } else {
                binance::run_combined_ticker_stream(syms, app, cancel_rx).await;
            }
        });

        tracing::info!(count = self.active_symbols.len(), "ticker symbols synced");
    }

    fn stop_stream(&mut self) {
        if let Some(tx) = self.cancel_tx.take() {
            let _ = tx.send(true);
        }
    }
}

pub struct TickerManagerState(pub Mutex<TickerManager>);

impl TickerManagerState {
    pub fn new(app: AppHandle) -> Self {
        Self(Mutex::new(TickerManager::new(app)))
    }
}
