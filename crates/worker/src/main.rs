use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::Response,
    routing::{get, post},
};
use ga_fire_engine::{
    Budget, DeckEvalRequest, DeckEvalResult, ENGINE_VERSION, EvalProgress, OptimizeProgress,
    OptimizeRequest, OptimizeResult, SimType, SolveRequest, SolveResult, card_catalog, hand_threads,
};
use serde::Serialize;
use std::{net::SocketAddr, ops::ControlFlow, sync::Arc};
use tokio::sync::{Semaphore, mpsc};
use tokio_stream::{StreamExt, wrappers::ReceiverStream};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
struct AppState {
    semaphore: Arc<Semaphore>,
    budget: Budget,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum EvaluateStreamEvent {
    Progress {
        sample: u16,
        total: u16,
        rollout: u16,
        total_rollouts: u16,
    },
    Result(DeckEvalResult),
    Error {
        message: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum OptimizeStreamEvent {
    Progress(OptimizeProgress),
    Result(OptimizeResult),
    Error { message: String },
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let concurrency = worker_concurrency();
    let host = std::env::var("WORKER_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port = std::env::var("WORKER_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(8081);

    let state = AppState {
        semaphore: Arc::new(Semaphore::new(concurrency)),
        budget: Budget::default(),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/version", get(version))
        .route("/cards", get(cards))
        .route("/solve", post(solve_handler))
        .route("/evaluate", post(evaluate_handler))
        .route("/optimize", post(optimize_handler))
        .with_state(state);

    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .expect("valid listen address");
    tracing::info!(
        "worker listening on {addr} (concurrency={concurrency}, monte_carlo_hand_threads={})",
        hand_threads(SimType::MonteCarlo)
    );
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind listener");
    axum::serve(listener, app).await.expect("serve");
}

async fn health() -> StatusCode {
    StatusCode::OK
}

async fn version() -> Json<ga_fire_engine::EngineVersion> {
    Json(ENGINE_VERSION)
}

async fn cards() -> Json<Vec<ga_fire_engine::CardDef>> {
    Json(card_catalog())
}

async fn solve_handler(
    State(state): State<AppState>,
    Json(mut request): Json<SolveRequest>,
) -> Result<Json<SolveResult>, StatusCode> {
    let _permit = state
        .semaphore
        .try_acquire()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    request.budget = merge_budget(request.budget, state.budget);
    ga_fire_engine::solve(&request)
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn evaluate_handler(
    State(state): State<AppState>,
    Json(mut request): Json<DeckEvalRequest>,
) -> Result<Response, StatusCode> {
    let _permit = state
        .semaphore
        .clone()
        .try_acquire_owned()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    request.budget = merge_budget(request.budget, state.budget);
    stream_ndjson(move |tx| {
        let result = ga_fire_engine::evaluate_with_progress(&request, |progress: EvalProgress| {
            let event = EvaluateStreamEvent::Progress {
                sample: progress.sample,
                total: progress.total,
                rollout: progress.rollout,
                total_rollouts: progress.total_rollouts,
            };
            if tx
                .blocking_send(serde_json::to_string(&event).expect("serialize progress") + "\n")
                .is_err()
            {
                return ControlFlow::Break(());
            }
            ControlFlow::Continue(())
        });
        match result {
            Ok(value) => {
                let event = EvaluateStreamEvent::Result(value);
                let _ = tx
                    .blocking_send(serde_json::to_string(&event).expect("serialize result") + "\n");
            }
            Err(message) => {
                let event = EvaluateStreamEvent::Error { message };
                let _ = tx
                    .blocking_send(serde_json::to_string(&event).expect("serialize error") + "\n");
            }
        }
    })
    .await
}

async fn optimize_handler(
    State(state): State<AppState>,
    Json(mut request): Json<OptimizeRequest>,
) -> Result<Response, StatusCode> {
    let _permit = state
        .semaphore
        .clone()
        .try_acquire_owned()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    request.budget = merge_budget(request.budget, state.budget);
    stream_ndjson(move |tx| {
        let result = ga_fire_engine::optimize_with_progress(&request, |progress| {
            let event = OptimizeStreamEvent::Progress(progress);
            if tx
                .blocking_send(serde_json::to_string(&event).expect("serialize progress") + "\n")
                .is_err()
            {
                return ControlFlow::Break(());
            }
            ControlFlow::Continue(())
        });
        match result {
            Ok(value) => {
                let event = OptimizeStreamEvent::Result(value);
                let _ = tx
                    .blocking_send(serde_json::to_string(&event).expect("serialize result") + "\n");
            }
            Err(message) => {
                let event = OptimizeStreamEvent::Error { message };
                let _ = tx
                    .blocking_send(serde_json::to_string(&event).expect("serialize error") + "\n");
            }
        }
    })
    .await
}

fn default_worker_concurrency() -> usize {
    2
}

fn worker_concurrency() -> usize {
    std::env::var("WORKER_CONCURRENCY")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or_else(default_worker_concurrency)
}

fn merge_budget(request: Budget, worker: Budget) -> Budget {
    if request == Budget::default() {
        worker
    } else {
        request
    }
}

async fn stream_ndjson(
    run: impl FnOnce(mpsc::Sender<String>) + Send + 'static,
) -> Result<Response, StatusCode> {
    let (tx, rx) = mpsc::channel::<String>(32);
    tokio::task::spawn_blocking(move || run(tx));
    let body = axum::body::Body::from_stream(
        ReceiverStream::new(rx).map(|chunk| Ok::<_, std::convert::Infallible>(chunk)),
    );
    Ok(Response::builder()
        .header("Content-Type", "application/x-ndjson")
        .header("Cache-Control", "no-cache, no-transform")
        .header("X-Accel-Buffering", "no")
        .body(body)
        .expect("response body"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worker_concurrency_defaults_to_two_for_local_dev() {
        assert_eq!(default_worker_concurrency(), 2);
    }

    #[test]
    fn merge_budget_keeps_explicit_request_budget() {
        let custom = Budget {
            max_eval_rollouts: 8,
            ..Budget::default()
        };
        assert_eq!(merge_budget(custom, Budget::default()), custom);
    }
}
