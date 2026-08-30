#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CandleChange {
    Replace,
    Prepend { count: usize },
    PatchLast,
    TrimHead { dropped: usize },
}

impl CandleChange {
    pub fn needs_full_recompute(self) -> bool {
        matches!(
            self,
            CandleChange::Replace | CandleChange::Prepend { .. } | CandleChange::TrimHead { .. }
        )
    }
}
