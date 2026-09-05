import fs from "node:fs/promises";
import { MANIFEST_PATH } from "./paths.ts";
import type { Manifest } from "./types.ts";

export async function readManifest(): Promise<Manifest> {
  const raw = await fs.readFile(MANIFEST_PATH, "utf8");
  return JSON.parse(raw) as Manifest;
}

export async function writeManifest(manifest: Manifest): Promise<void> {
  await fs.writeFile(
    MANIFEST_PATH,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}
