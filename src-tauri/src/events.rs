use crate::core::model::Candle;
use tauri::{AppHandle, Emitter};

pub const CANDLE_UPDATE: &str = "candle-update";

pub fn emit_candle(app: &AppHandle, candle: &Candle) {
    if let Err(e) = app.emit(CANDLE_UPDATE, candle) {
        tracing::warn!(error = %e, "failed to emit candle-update");
    }
}
