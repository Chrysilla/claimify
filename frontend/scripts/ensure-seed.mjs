// Seeds the claims SQLite DB only if it doesn't exist yet, so `dev` restarts
// don't wipe in-progress state. Run `npm run seed:claims` to force a reset.
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const dbPath = process.env.CLAIMS_DB_PATH || path.join(process.cwd(), "claimify-claims.db");

if (existsSync(dbPath)) {
  console.log(
    `→ Claims DB present (${path.basename(dbPath)}); skipping seed. Run "npm run seed:claims" to reset.`,
  );
} else {
  console.log("→ Claims DB missing; seeding from the FHIR dataset...");
  execSync("npm run seed:claims", { stdio: "inherit" });
}
