use clap::{Parser, Subcommand};
use ga_fire_engine::{SolveRequest, evaluate_json, format_line_event_row, optimize_json, solve};
use std::{collections::BTreeMap, fs, process::ExitCode};

#[derive(Parser)]
#[command(name = "ga-fire", about = "Optimized Grand Archive FiZa damage solver")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Solve one opening hand.
    Solve {
        /// Card ids, for example: arthur kingdom_informant rending_flames
        cards: Vec<String>,
        #[arg(long, default_value_t = true)]
        go_first: bool,
        #[arg(long, default_value_t = 3)]
        turns: u8,
        /// Emit machine-readable JSON instead of the formatted line.
        #[arg(long)]
        json: bool,
    },
    /// Evaluate a JSON deck request from a file.
    Evaluate { request: String },
    /// Optimize ratios from a JSON request file.
    Optimize { request: String },
}

fn main() -> ExitCode {
    match run() {
        Ok(output) => {
            println!("{output}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<String, String> {
    match Cli::parse().command {
        Command::Solve {
            cards,
            go_first,
            turns,
            json,
        } => {
            let request = SolveRequest {
                hand: cards,
                go_first,
                max_turns: turns,
                sim_type: Default::default(),
                deck: BTreeMap::new(),
                queue: None,
                rollouts: 12,
                seed: 42,
                budget: Default::default(),
                materials: BTreeMap::new(),
                max_threads: None,
                glimpse_enabled: None,
                max_hand_duration_secs: None,

                max_card_draw: None,
            };
            let result = solve(&request).map_err(|error| error.to_string())?;
            if json {
                return serde_json::to_string(&result).map_err(|error| error.to_string());
            }
            let mut formatted = format!(
                "Max damage: {}  |  states: {}  |  {:.2} ms\n",
                result.max_damage, result.nodes, result.elapsed_ms
            );
            let mut last_hand: Option<Vec<&str>> = None;
            let mut last_memory: Option<Vec<&str>> = None;
            let mut last_allies: Option<Vec<&str>> = None;
            for mut event in result.events {
                if event.hand.is_some() {
                    last_hand = event.hand.clone();
                } else {
                    event.hand = last_hand.clone();
                }
                if event.memory.is_some() {
                    last_memory = event.memory.clone();
                } else {
                    event.memory = last_memory.clone();
                }
                if event.allies.is_some() {
                    last_allies = event.allies.clone();
                } else {
                    event.allies = last_allies.clone();
                }
                formatted.push_str(&format_line_event_row(&event));
                formatted.push('\n');
            }
            Ok(formatted)
        }
        Command::Evaluate { request } => {
            let input = fs::read_to_string(request).map_err(|error| error.to_string())?;
            evaluate_json(&input).map_err(|error| error.to_string())
        }
        Command::Optimize { request } => {
            let input = fs::read_to_string(request).map_err(|error| error.to_string())?;
            optimize_json(&input).map_err(|error| error.to_string())
        }
    }
}
