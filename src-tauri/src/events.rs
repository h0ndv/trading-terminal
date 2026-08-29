use crate::core::model::CandleUpdateEvent;
use tauri::{AppHandle, Emitter};

pub const CANDLE_UPDATE: &str = "candle-update";

pub fn emit_candle_update(app: &AppHandle, event: &CandleUpdateEvent) {
    if let Err(e) = app.emit(CANDLE_UPDATE, event) {
        tracing::warn!(error = %e, "failed to emit candle-update");
    }
}
