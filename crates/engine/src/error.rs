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

#[cfg(test)]
mod tests {
    use super::EngineError;

    #[test]
    fn display_strings_are_stable() {
        let cases = [
            (EngineError::Cancelled, "cancelled"),
            (EngineError::HandTimeout, "hand exceeded max duration"),
            (
                EngineError::UnknownCard("not_a_card".into()),
                "unknown card: not_a_card",
            ),
            (
                EngineError::UnknownQueueCard("bad_queue".into()),
                "unknown card in queue: bad_queue",
            ),
            (
                EngineError::UnknownDeckCard("bad_deck".into()),
                "unknown card in deck: bad_deck",
            ),
            (
                EngineError::invalid("hand must contain 2–16 cards"),
                "hand must contain 2–16 cards",
            ),
        ];
        for (error, expected) in cases {
            assert_eq!(error.to_string(), expected, "{error:?}");
        }
    }

    #[test]
    fn invalid_json_includes_kind() {
        let err = EngineError::InvalidJson {
            kind: "solve",
            source: serde_json::from_str::<serde_json::Value>("not json").unwrap_err(),
        };
        assert!(
            err.to_string().starts_with("invalid solve request:"),
            "{}",
            err
        );
    }
}
