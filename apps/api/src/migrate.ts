import { createDb, migrateToLatest } from "./db/index.js";
import { env } from "./env.js";

async function main() {
  const db = createDb(env("DATABASE_URL"));
  await migrateToLatest(db);
  console.log("migrations complete");
  await db.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
