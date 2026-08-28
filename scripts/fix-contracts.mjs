import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const generatedDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/contracts/generated",
);

const files = (await readdir(generatedDir)).filter((file) => file.endsWith(".ts") && file !== "index.ts");
for (const file of files) {
  const fullPath = path.join(generatedDir, file);
  const source = await readFile(fullPath, "utf8");
  const fixed = source.replace(/from "\.\/([^"]+)";/g, (match, name) =>
    name.endsWith(".js") ? match : `from "./${name}.js";`,
  );
  if (fixed !== source) {
    await writeFile(fullPath, fixed);
  }
}

const typeFiles = files
  .map((file) => file.replace(/\.ts$/, ""))
  .sort((a, b) => a.localeCompare(b));

const index = `${typeFiles.map((name) => `export type { ${name} } from "./${name}.js";`).join("\n")}\n`;

await writeFile(path.join(generatedDir, "index.ts"), index);
