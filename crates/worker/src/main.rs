use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{get, post},
};
use ga_fire_engine::{
    Budget, CancelFlag, DeckEvalRequest, DeckEvalResult, ENGINE_VERSION, EvalProgress, HandPhase,
    HandProgress, OptimizeProgress, OptimizeRequest, OptimizeResult, PlaytestApplyRequest,
    PlaytestApplyResult, PlaytestInitRequest, PlaytestInitResult, PlaytestLegalActionsRequest,
    PlaytestLegalActionsResult, PressureLevel, SimType, SolveRequest, SolveResult, card_catalog,
    current_pressure, evaluate_with_hand_progress_cancel, hand_threads, is_save_requested_on,
    memory_config, new_cancel_flag, optimize_with_hand_progress, playtest_apply, playtest_init,
    playtest_legal_actions, request_cancel, request_save,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Instant;
use std::{net::SocketAddr, ops::ControlFlow, sync::Arc};
use tokio::sync::{Semaphore, mpsc};
use tokio_stream::{StreamExt, wrappers::ReceiverStream};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
struct AppState {
    semaphore: Arc<Semaphore>,
    budget: Budget,
    jobs: Arc<Mutex<HashMap<String, CancelFlag>>>,
}

#[derive(Deserialize)]
struct StopJobRequest {
    #[serde(default)]
    save: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum EvaluateStreamEvent {
    Progress {
        sample: u16,
        total: u16,
        rollout: u16,
        #[serde(rename = "totalRollouts")]
        total_rollouts: u16,
    },
    /// `rename_all` on the enum only renames the `kind` tag; field names on
    /// struct variants need their own camelCase rename.
    #[serde(rename_all = "camelCase")]
    HandProgress {
        sample_index: u16,
        phase: HandPhase,
        rollout: u16,
        total_rollouts: u16,
    },
    #[serde(rename_all = "camelCase")]
    MemoryPressure {
        level: PressureLevel,
    },
    /// Keep the API→worker NDJSON body alive during long silent Oracle hands
    /// (undici defaults to a 300s idle body timeout).
    Heartbeat,
    // Boxed: the result payload dwarfs the other variants (serde output is
    // identical, so the wire contract is unchanged).
    Result(Box<DeckEvalResult>),
    PartialResult(Box<DeckEvalResult>),
    Error {
        message: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum OptimizeStreamEvent {
    Progress(OptimizeProgress),
    /// `rename_all` on the enum only renames the `kind` tag; field names on
    /// struct variants need their own camelCase rename.
    #[serde(rename_all = "camelCase")]
    HandProgress {
        sample_index: u16,
        phase: HandPhase,
        rollout: u16,
        total_rollouts: u16,
    },
    #[serde(rename_all = "camelCase")]
    MemoryPressure {
        level: PressureLevel,
    },
    Heartbeat,
    Result(Box<OptimizeResult>),
    PartialResult(Box<OptimizeResult>),
    Error {
        message: String,
    },
}

/// Idle gap between heartbeat NDJSON lines. Must stay well under the API
/// client's undici `bodyTimeout` (default 300s).
const HEARTBEAT_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);

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
        jobs: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/version", get(version))
        .route("/cards", get(cards))
        .route("/solve", post(solve_handler))
        .route("/playtest/init", post(playtest_init_handler))
        .route(
            "/playtest/legal-actions",
            post(playtest_legal_actions_handler),
        )
        .route("/playtest/apply", post(playtest_apply_handler))
        .route("/evaluate", post(evaluate_handler))
        .route("/optimize", post(optimize_handler))
        .route("/jobs/{id}/stop", post(stop_job_handler))
        .with_state(state);

    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .expect("valid listen address");
    let mem = memory_config();
    tracing::info!(
        concurrency,
        monte_carlo_hand_threads = hand_threads(SimType::MonteCarlo),
        hand_mem_mb = mem.hand_mem_mb,
        reserve_mb = mem.reserve_mb,
        park_mb = mem.park_mb,
        mem_total_mb = mem.total_mb,
        "worker listening on {addr}"
    );
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind listener");
    axum::serve(listener, app).await.expect("serve");
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        cpu_count: u16::try_from(ga_fire_engine::cpu_count()).unwrap_or(u16::MAX),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    cpu_count: u16,
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
    // CPU-bound search; keep it off the async runtime threads.
    tokio::task::spawn_blocking(move || ga_fire_engine::solve(&request))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn playtest_init_handler(
    Json(request): Json<PlaytestInitRequest>,
) -> Result<Json<PlaytestInitResult>, (StatusCode, Json<PlaytestErrorBody>)> {
    playtest_init(&request).map(Json).map_err(playtest_error)
}

async fn playtest_legal_actions_handler(
    Json(request): Json<PlaytestLegalActionsRequest>,
) -> Result<Json<PlaytestLegalActionsResult>, (StatusCode, Json<PlaytestErrorBody>)> {
    playtest_legal_actions(&request)
        .map(Json)
        .map_err(playtest_error)
}

async fn playtest_apply_handler(
    Json(request): Json<PlaytestApplyRequest>,
) -> Result<Json<PlaytestApplyResult>, (StatusCode, Json<PlaytestErrorBody>)> {
    playtest_apply(&request).map(Json).map_err(playtest_error)
}

#[derive(Serialize)]
struct PlaytestErrorBody {
    error: String,
}

fn playtest_error(error: ga_fire_engine::EngineError) -> (StatusCode, Json<PlaytestErrorBody>) {
    (
        StatusCode::BAD_REQUEST,
        Json(PlaytestErrorBody {
            error: error.to_string(),
        }),
    )
}

async fn evaluate_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut request): Json<DeckEvalRequest>,
) -> Result<Response, StatusCode> {
    let permit = state
        .semaphore
        .clone()
        .try_acquire_owned()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    request.budget = merge_budget(request.budget, state.budget);
    let logger = RunLogger::start(format!(
        "evaluate {:?} samples={} rollouts={} max_turns={} hand_threads={}",
        request.sim_type,
        request.samples,
        request.rollouts,
        request.max_turns,
        hand_threads(request.sim_type),
    ));
    let run_id = run_id_from_headers(&headers);
    let jobs = state.jobs.clone();
    stream_ndjson(move |tx| {
        // Held until the compute finishes so the concurrency limit covers the
        // actual work, not just the response setup.
        let _permit = permit;
        let hand_logger = logger.clone();
        let cancel = new_cancel_flag();
        let _job_guard = register_job(jobs, run_id, cancel.clone());
        let pressure_stop = Arc::new(AtomicBool::new(false));
        spawn_disconnect_watch(tx.clone(), cancel.clone(), pressure_stop.clone());
        spawn_pressure_watch(tx.clone(), pressure_stop.clone(), cancel.clone());
        spawn_heartbeat_watch(
            tx.clone(),
            pressure_stop.clone(),
            cancel.clone(),
            EvaluateStreamEvent::Heartbeat,
        );
        let cancel_for_progress = cancel.clone();
        let result = evaluate_with_hand_progress_cancel(
            &request,
            |progress: EvalProgress| {
                let event = EvaluateStreamEvent::Progress {
                    sample: progress.sample,
                    total: progress.total,
                    rollout: progress.rollout,
                    total_rollouts: progress.total_rollouts,
                };
                send_event_or_cancel(&tx, &event, &cancel_for_progress)
            },
            |progress: HandProgress| {
                if let Some(log) = &hand_logger {
                    log.hand_event(&progress);
                }
                let event = EvaluateStreamEvent::HandProgress {
                    sample_index: progress.sample_index,
                    phase: progress.phase,
                    rollout: progress.rollout,
                    total_rollouts: progress.total_rollouts,
                };
                send_event_or_cancel(&tx, &event, &cancel_for_progress)
            },
            cancel.clone(),
        );
        pressure_stop.store(true, Ordering::Relaxed);
        if let Some(log) = &logger {
            match &result {
                Ok(_) => log.finish("ok"),
                Err(error) => log.finish(&format!("error: {error}")),
            }
        }
        let event = match result {
            Ok(value) => evaluate_result_event(value, &cancel, request.samples),
            Err(error) => EvaluateStreamEvent::Error {
                message: error.to_string(),
            },
        };
        let _ = send_event(&tx, &event);
    })
    .await
}

async fn optimize_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut request): Json<OptimizeRequest>,
) -> Result<Response, StatusCode> {
    let permit = state
        .semaphore
        .clone()
        .try_acquire_owned()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    request.budget = merge_budget(request.budget, state.budget);
    let run_id = run_id_from_headers(&headers);
    let jobs = state.jobs.clone();
    stream_ndjson(move |tx| {
        let _permit = permit;
        let cancel = new_cancel_flag();
        let _job_guard = register_job(jobs, run_id, cancel.clone());
        let pressure_stop = Arc::new(AtomicBool::new(false));
        spawn_disconnect_watch(tx.clone(), cancel.clone(), pressure_stop.clone());
        spawn_optimize_pressure_watch(tx.clone(), pressure_stop.clone(), cancel.clone());
        spawn_heartbeat_watch(
            tx.clone(),
            pressure_stop.clone(),
            cancel.clone(),
            OptimizeStreamEvent::Heartbeat,
        );
        let cancel_for_progress = cancel.clone();
        let _cancel_guard = ga_fire_engine::install_cancel(cancel.clone());
        let result = optimize_with_hand_progress(
            &request,
            |progress| {
                let event = OptimizeStreamEvent::Progress(progress);
                send_event_or_cancel(&tx, &event, &cancel_for_progress)
            },
            |progress: HandProgress| {
                let event = OptimizeStreamEvent::HandProgress {
                    sample_index: progress.sample_index,
                    phase: progress.phase,
                    rollout: progress.rollout,
                    total_rollouts: progress.total_rollouts,
                };
                send_event_or_cancel(&tx, &event, &cancel_for_progress)
            },
        );
        pressure_stop.store(true, Ordering::Relaxed);
        let event = match result {
            Ok(value) => optimize_result_event(value, &cancel, request.decks),
            Err(error) => OptimizeStreamEvent::Error {
                message: error.to_string(),
            },
        };
        let _ = send_event(&tx, &event);
    })
    .await
}

async fn stop_job_handler(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    Json(body): Json<StopJobRequest>,
) -> StatusCode {
    let jobs = state.jobs.lock().unwrap_or_else(|err| err.into_inner());
    let Some(flag) = jobs.get(&job_id) else {
        return StatusCode::NOT_FOUND;
    };
    if body.save {
        request_save(flag);
    } else {
        request_cancel(flag);
    }
    StatusCode::ACCEPTED
}

fn run_id_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-run-id")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
}

struct JobGuard {
    id: Option<String>,
    jobs: Arc<Mutex<HashMap<String, CancelFlag>>>,
}

impl Drop for JobGuard {
    fn drop(&mut self) {
        if let Some(id) = self.id.take() {
            self.jobs
                .lock()
                .unwrap_or_else(|err| err.into_inner())
                .remove(&id);
        }
    }
}

fn register_job(
    jobs: Arc<Mutex<HashMap<String, CancelFlag>>>,
    run_id: Option<String>,
    cancel: CancelFlag,
) -> JobGuard {
    if let Some(id) = run_id.as_ref() {
        jobs.lock()
            .unwrap_or_else(|err| err.into_inner())
            .insert(id.clone(), cancel);
    }
    JobGuard { id: run_id, jobs }
}

fn evaluate_result_event(
    value: DeckEvalResult,
    cancel: &CancelFlag,
    requested_samples: u16,
) -> EvaluateStreamEvent {
    if is_save_requested_on(cancel) && value.samples < usize::from(requested_samples) {
        EvaluateStreamEvent::PartialResult(Box::new(value))
    } else {
        EvaluateStreamEvent::Result(Box::new(value))
    }
}

fn optimize_result_event(
    value: OptimizeResult,
    cancel: &CancelFlag,
    requested_decks: u32,
) -> OptimizeStreamEvent {
    let target = value.effective.decks.unwrap_or(requested_decks);
    if is_save_requested_on(cancel) && value.decks_scored < target {
        OptimizeStreamEvent::PartialResult(Box::new(value))
    } else {
        OptimizeStreamEvent::Result(Box::new(value))
    }
}

/// Opt-in per-run diagnostics (`WORKER_LOG_RUNS=1`). Logs each hand's
/// start/finish and samples process RSS every few seconds while a run is
/// active, so an OOM-prone eval shows which hand was in flight — and how fast
/// memory was climbing — when the worker died.
#[derive(Clone)]
struct RunLogger {
    hands: Arc<Mutex<HashMap<u16, Instant>>>,
    peak_rss_mb: Arc<AtomicU64>,
    stop: Arc<AtomicBool>,
}

impl RunLogger {
    fn start(summary: String) -> Option<Self> {
        if !run_logging_enabled() {
            return None;
        }
        let logger = Self {
            hands: Arc::new(Mutex::new(HashMap::new())),
            peak_rss_mb: Arc::new(AtomicU64::new(0)),
            stop: Arc::new(AtomicBool::new(false)),
        };
        tracing::info!(
            %summary,
            mem_available_mb = mem_available_mb(),
            rss_mb = rss_mb(),
            "run started"
        );
        let sampler = logger.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(std::time::Duration::from_secs(2));
            // First tick fires immediately; skip it so samples are spaced out.
            tick.tick().await;
            loop {
                tick.tick().await;
                if sampler.stop.load(Ordering::Relaxed) {
                    break;
                }
                sampler.sample_rss();
            }
        });
        Some(logger)
    }

    fn hand_event(&self, progress: &HandProgress) {
        match progress.phase {
            HandPhase::Started => {
                self.hands
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .insert(progress.sample_index, Instant::now());
                tracing::info!(
                    sample = progress.sample_index,
                    total_rollouts = progress.total_rollouts,
                    rss_mb = self.note_rss(),
                    "hand started"
                );
            }
            HandPhase::Done => {
                let started = self
                    .hands
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .remove(&progress.sample_index);
                tracing::info!(
                    sample = progress.sample_index,
                    elapsed_s = started.map(|at| at.elapsed().as_secs()),
                    rss_mb = self.note_rss(),
                    "hand done"
                );
            }
            HandPhase::Throttled => {
                tracing::info!(
                    sample = progress.sample_index,
                    rss_mb = self.note_rss(),
                    "hand waiting for memory"
                );
            }
            HandPhase::TimedOut => {
                self.hands
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .remove(&progress.sample_index);
                tracing::info!(
                    sample = progress.sample_index,
                    rss_mb = self.note_rss(),
                    "hand timed out"
                );
            }
            HandPhase::Rollout => {}
        }
    }

    /// Current RSS folded into the running peak, so short runs that never see
    /// a sampler tick still report a meaningful peak.
    fn note_rss(&self) -> Option<u64> {
        let rss = rss_mb()?;
        self.peak_rss_mb.fetch_max(rss, Ordering::Relaxed);
        Some(rss)
    }

    fn sample_rss(&self) {
        let Some(rss) = self.note_rss() else { return };
        let peak = self.peak_rss_mb.load(Ordering::Relaxed);
        let in_flight: Vec<String> = self
            .hands
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .iter()
            .map(|(index, since)| format!("#{index} {}s", since.elapsed().as_secs()))
            .collect();
        tracing::info!(rss_mb = rss, peak_mb = peak, ?in_flight, "run rss");
    }

    fn finish(&self, outcome: &str) {
        self.stop.store(true, Ordering::Relaxed);
        let rss = self.note_rss();
        tracing::info!(
            %outcome,
            rss_mb = rss,
            peak_mb = self.peak_rss_mb.load(Ordering::Relaxed),
            "run finished"
        );
    }
}

fn run_logging_enabled() -> bool {
    std::env::var("WORKER_LOG_RUNS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn rss_mb() -> Option<u64> {
    proc_kb_field("/proc/self/status", "VmRSS:")
}

fn mem_available_mb() -> Option<u64> {
    proc_kb_field("/proc/meminfo", "MemAvailable:")
}

fn proc_kb_field(path: &str, field: &str) -> Option<u64> {
    let contents = std::fs::read_to_string(path).ok()?;
    let line = contents.lines().find(|line| line.starts_with(field))?;
    let kb = line.split_whitespace().nth(1)?.parse::<u64>().ok()?;
    Some(kb / 1024)
}

/// Serialize and send one NDJSON event. A serialization or send failure ends
/// the stream instead of panicking the blocking task.
fn send_event(tx: &mpsc::Sender<String>, event: &impl Serialize) -> ControlFlow<()> {
    let Ok(line) = serde_json::to_string(event) else {
        return ControlFlow::Break(());
    };
    if tx.blocking_send(format!("{line}\n")).is_err() {
        return ControlFlow::Break(());
    }
    ControlFlow::Continue(())
}

fn send_event_or_cancel(
    tx: &mpsc::Sender<String>,
    event: &impl Serialize,
    cancel: &ga_fire_engine::CancelFlag,
) -> ControlFlow<()> {
    match send_event(tx, event) {
        ControlFlow::Continue(()) => ControlFlow::Continue(()),
        ControlFlow::Break(()) => {
            request_cancel(cancel);
            ControlFlow::Break(())
        }
    }
}

/// Poll for client disconnect so long Oracle searches abort without waiting
/// for the next progress event (which may be minutes away).
fn spawn_disconnect_watch(
    tx: mpsc::Sender<String>,
    cancel: ga_fire_engine::CancelFlag,
    stop: Arc<AtomicBool>,
) {
    std::thread::Builder::new()
        .name("ga-fire-disconnect-watch".into())
        .spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                if tx.is_closed() {
                    request_cancel(&cancel);
                    tracing::info!("client disconnected; cancelling in-flight search");
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        })
        .ok();
}

/// Emit a tiny NDJSON line on a fixed interval so the API fetch does not idle
/// out while a single hand searches for minutes without progress events.
fn spawn_heartbeat_watch(
    tx: mpsc::Sender<String>,
    stop: Arc<AtomicBool>,
    cancel: ga_fire_engine::CancelFlag,
    event: impl Serialize + Send + 'static,
) {
    std::thread::Builder::new()
        .name("ga-fire-heartbeat".into())
        .spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                std::thread::sleep(HEARTBEAT_INTERVAL);
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                if tx.is_closed() {
                    request_cancel(&cancel);
                    return;
                }
                if send_event_or_cancel(&tx, &event, &cancel).is_break() {
                    return;
                }
            }
        })
        .ok();
}

/// Always-on watch: emit `memoryPressure` when the engine pressure level changes.
fn spawn_pressure_watch(
    tx: mpsc::Sender<String>,
    stop: Arc<AtomicBool>,
    cancel: ga_fire_engine::CancelFlag,
) {
    std::thread::Builder::new()
        .name("ga-fire-pressure-watch".into())
        .spawn(move || {
            let mut last = current_pressure();
            if last != PressureLevel::Clear {
                let event = EvaluateStreamEvent::MemoryPressure { level: last };
                if send_event_or_cancel(&tx, &event, &cancel).is_break() {
                    return;
                }
            }
            while !stop.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_secs(1));
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                if tx.is_closed() {
                    request_cancel(&cancel);
                    return;
                }
                let level = current_pressure();
                if level != last {
                    last = level;
                    let event = EvaluateStreamEvent::MemoryPressure { level };
                    if send_event_or_cancel(&tx, &event, &cancel).is_break() {
                        return;
                    }
                }
            }
        })
        .ok();
}

fn spawn_optimize_pressure_watch(
    tx: mpsc::Sender<String>,
    stop: Arc<AtomicBool>,
    cancel: ga_fire_engine::CancelFlag,
) {
    std::thread::Builder::new()
        .name("ga-fire-opt-pressure-watch".into())
        .spawn(move || {
            let mut last = current_pressure();
            if last != PressureLevel::Clear {
                let event = OptimizeStreamEvent::MemoryPressure { level: last };
                if send_event_or_cancel(&tx, &event, &cancel).is_break() {
                    return;
                }
            }
            while !stop.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_secs(1));
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                if tx.is_closed() {
                    request_cancel(&cancel);
                    return;
                }
                let level = current_pressure();
                if level != last {
                    last = level;
                    let event = OptimizeStreamEvent::MemoryPressure { level };
                    if send_event_or_cancel(&tx, &event, &cancel).is_break() {
                        return;
                    }
                }
            }
        })
        .ok();
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
    let (tx, rx) = mpsc::channel::<String>(512);
    tokio::task::spawn_blocking(move || run(tx));
    let body = axum::body::Body::from_stream(
        ReceiverStream::new(rx).map(Ok::<_, std::convert::Infallible>),
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
    fn proc_kb_field_reads_meminfo_style_lines() {
        let meminfo = "MemTotal:       32768 kB\nMemAvailable:   12345 kB\nBuffers:  1 kB\n";
        // Read through the same parsing path via a temp file.
        let path = std::env::temp_dir().join(format!("ga-fire-test-{}.txt", std::process::id()));
        std::fs::write(&path, meminfo).unwrap();
        assert_eq!(
            proc_kb_field(path.to_str().unwrap(), "MemAvailable:"),
            Some(12)
        );
        assert_eq!(proc_kb_field(path.to_str().unwrap(), "Missing:"), None);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn merge_budget_keeps_explicit_request_budget() {
        let custom = Budget {
            max_eval_rollouts: 8,
            ..Budget::default()
        };
        assert_eq!(merge_budget(custom, Budget::default()), custom);
    }

    #[test]
    fn evaluate_stream_events_use_camel_case_fields() {
        let progress = serde_json::to_value(EvaluateStreamEvent::Progress {
            sample: 1,
            total: 8,
            rollout: 0,
            total_rollouts: 16,
        })
        .unwrap();
        assert_eq!(progress["kind"], "progress");
        assert_eq!(progress["totalRollouts"], 16);
        assert!(progress.get("total_rollouts").is_none());

        let hand = serde_json::to_value(EvaluateStreamEvent::HandProgress {
            sample_index: 3,
            phase: HandPhase::Started,
            rollout: 0,
            total_rollouts: 16,
        })
        .unwrap();
        assert_eq!(hand["kind"], "handProgress");
        assert_eq!(hand["sampleIndex"], 3);
        assert_eq!(hand["totalRollouts"], 16);
        assert_eq!(hand["phase"], "started");
        assert!(hand.get("sample_index").is_none());

        let throttled = serde_json::to_value(EvaluateStreamEvent::HandProgress {
            sample_index: 3,
            phase: HandPhase::Throttled,
            rollout: 0,
            total_rollouts: 16,
        })
        .unwrap();
        assert_eq!(throttled["phase"], "throttled");

        let heartbeat = serde_json::to_value(EvaluateStreamEvent::Heartbeat).unwrap();
        assert_eq!(heartbeat, serde_json::json!({ "kind": "heartbeat" }));

        let pressure = serde_json::to_value(EvaluateStreamEvent::MemoryPressure {
            level: PressureLevel::Squeeze,
        })
        .unwrap();
        assert_eq!(pressure["kind"], "memoryPressure");
        assert_eq!(pressure["level"], "squeeze");
    }
}
