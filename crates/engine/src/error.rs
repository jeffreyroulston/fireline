use thiserror::Error;

/// Errors returned by engine entry points.
///
/// The `Display` text is part of the worker/CLI contract: the worker maps it
/// into NDJSON error events and the CLI prints it. Keep messages stable.
#[derive(Debug, Error)]
pub enum EngineError {
    /// The caller cancelled through a progress callback.
    #[error("cancelled")]
    Cancelled,

    /// A per-hand wall-clock deadline was exceeded.
    #[error("hand exceeded max duration")]
    HandTimeout,

    #[error("unknown card: {0}")]
    UnknownCard(String),

    #[error("unknown card in queue: {0}")]
    UnknownQueueCard(String),

    #[error("unknown card in deck: {0}")]
    UnknownDeckCard(String),

    /// Request failed validation (hand size, bounds, swap rules, ...).
    #[error("{0}")]
    InvalidRequest(String),

    /// Malformed JSON at a `*_json` boundary.
    #[error("invalid {kind} request: {source}")]
    InvalidJson {
        kind: &'static str,
        source: serde_json::Error,
    },

    /// Response serialization failed at a `*_json` boundary.
    #[error("{0}")]
    SerializeJson(serde_json::Error),

    #[error("rayon pool: {0}")]
    ThreadPool(#[from] rayon::ThreadPoolBuildError),
}

impl EngineError {
    pub(crate) fn invalid(message: impl Into<String>) -> Self {
        Self::InvalidRequest(message.into())
    }
}

pub type Result<T> = std::result::Result<T, EngineError>;
