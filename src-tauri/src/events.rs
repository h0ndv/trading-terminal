use crate::core::model::{CandleUpdateEvent, TickerStats};
use tauri::{AppHandle, Emitter};

pub const CANDLE_UPDATE: &str = "candle-update";
pub const TICKER_UPDATE: &str = "ticker-update";

pub fn emit_candle_update(app: &AppHandle, event: &CandleUpdateEvent) {
    if let Err(e) = app.emit(CANDLE_UPDATE, event) {
        tracing::warn!(error = %e, "failed to emit candle-update");
    }
}

pub fn emit_ticker_update(app: &AppHandle, stats: &TickerStats) {
    if let Err(e) = app.emit(TICKER_UPDATE, stats) {
        tracing::warn!(error = %e, "failed to emit ticker-update");
    }
}
