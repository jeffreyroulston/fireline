use clap::{Parser, Subcommand};
use ga_fire_engine::{evaluate_json, optimize_json, solve_json};
use std::{fs, process::ExitCode};

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
            let input = serde_json::json!({
                "hand": cards,
                "goFirst": go_first,
                "maxTurns": turns,
            });
            let output = solve_json(&input.to_string())?;
            if json {
                return Ok(output);
            }
            let result: serde_json::Value =
                serde_json::from_str(&output).map_err(|error| error.to_string())?;
            let mut formatted = format!(
                "Max damage: {}  |  states: {}  |  {:.2} ms\n",
                result["maxDamage"],
                result["nodes"],
                result["elapsedMs"].as_f64().unwrap_or_default()
            );
            for step in result["steps"].as_array().into_iter().flatten() {
                formatted.push_str(step["display"].as_str().unwrap_or_default());
                formatted.push('\n');
            }
            Ok(formatted)
        }
        Command::Evaluate { request } => {
            let input = fs::read_to_string(request).map_err(|error| error.to_string())?;
            evaluate_json(&input)
        }
        Command::Optimize { request } => {
            let input = fs::read_to_string(request).map_err(|error| error.to_string())?;
            optimize_json(&input)
        }
    }
}
