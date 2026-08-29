pub use crate::core::model::{IndicatorPoint, IndicatorSeries};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct IndicatorId(pub String);

impl IndicatorId {
    pub fn new(id: &str) -> Self {
        Self(id.to_uppercase())
    }
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum IndicatorError {
    #[error("unknown indicator: {0}")]
    Unknown(String),
    #[error("invalid params for {id}: {reason}")]
    InvalidParams { id: String, reason: String },
}
