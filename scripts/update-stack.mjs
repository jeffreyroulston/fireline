#!/usr/bin/env node
/**
 * Cross-platform Compose update (same behavior as scripts/update.sh / update.ps1).
 * Prefer those scripts on hosts without Node; use `pnpm update:stack` in this repo.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shell = process.platform === "win32";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (spawnSync("docker", ["version"], { stdio: "ignore", shell }).status !== 0) {
  console.error("docker not found on PATH");
  process.exit(1);
}

console.log("Pulling worker, api, and web images...");
run("docker", ["compose", "pull", "worker", "api", "web"]);

console.log("Restarting stack...");
run("docker", ["compose", "up", "-d"]);

const port = process.env.FIRELINE_PORT || "80";
const url = `http://127.0.0.1:${port}/api/version`;

console.log(`Waiting for API at ${url}...`);
let ok = false;
for (let i = 0; i < 45; i++) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      const body = await response.text();
      console.log(`Running: ${body}`);
      ok = true;
      break;
    }
  } catch {
    // not ready yet
  }
  await new Promise((r) => setTimeout(r, 2000));
}

if (!ok) {
  console.error(
    "Stack is up, but /api/version did not respond yet. Check: docker compose ps",
  );
  process.exit(1);
}
