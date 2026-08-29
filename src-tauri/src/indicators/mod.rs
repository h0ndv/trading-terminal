pub mod boll;
pub mod cci;
pub mod ema;
pub mod fixtures;
pub mod incremental;
pub mod kdj;
pub mod macd;
pub mod ma;
pub mod rsi;
pub mod traits;
pub mod types;
pub mod vol;
pub mod warm;

#[cfg(test)]
mod golden_tests;

use crate::indicators::boll::BollIndicator;
use crate::indicators::cci::CciIndicator;
use crate::indicators::ema::EmaIndicator;
use crate::indicators::kdj::KdjIndicator;
use crate::indicators::macd::MacdIndicator;
use crate::indicators::ma::MaIndicator;
use crate::indicators::rsi::RsiIndicator;
use crate::indicators::traits::Indicator;
use crate::indicators::types::{IndicatorError, IndicatorId};
use crate::indicators::vol::VolIndicator;
use std::sync::LazyLock;

static REGISTRY: LazyLock<Vec<Box<dyn Indicator>>> = LazyLock::new(|| {
    vec![
        Box::new(MaIndicator),
        Box::new(EmaIndicator),
        Box::new(BollIndicator),
        Box::new(VolIndicator),
        Box::new(MacdIndicator),
        Box::new(RsiIndicator),
        Box::new(CciIndicator),
        Box::new(KdjIndicator),
    ]
});

pub fn get_indicator(id: &str) -> Result<&'static dyn Indicator, IndicatorError> {
    let want = IndicatorId::new(id);
    REGISTRY
        .iter()
        .find(|ind| ind.id() == want)
        .map(|ind| ind.as_ref())
        .ok_or_else(|| IndicatorError::Unknown(id.to_string()))
}

pub fn supported_ids() -> Vec<String> {
    REGISTRY.iter().map(|i| i.id().0.clone()).collect()
}
