// Headless live validation harness — runs the layer-3 clinical agent against a
// seeded claim and prints its activity (including NCCI manual tool calls) and
// findings. Verifies the agent actually reaches into knowledge/ncci/.
//
// Usage: npx tsx scripts/live-validate-ncci.ts [claimId]
import Database from "better-sqlite3";
import path from "path";
import { runClinicalValidation, agentCredentialsAvailable } from "../lib/claims/agent";
import type { Claim837P, ClaimFinding } from "../lib/claims/types";
import type { FindingDraft } from "../lib/claims/validate";

const claimId = process.argv[2] ?? "clm-6b716621";
const db = new Database(
  process.env.CLAIMS_DB_PATH || path.join(process.cwd(), "claimify-claims.db"),
  { readonly: true },
);
const row = db
  .prepare("SELECT id, encounter_id, claim_json FROM claims WHERE id = ?")
  .get(claimId) as { id: string; encounter_id: string; claim_json: string } | undefined;
if (!row) {
  console.error(`claim ${claimId} not found`);
  process.exit(1);
}
const claim = JSON.parse(row.claim_json) as Claim837P;
const encounterId = row.encounter_id;

console.log(`Claim ${claimId}  engine=${agentCredentialsAvailable() ? "agent" : "mock"}`);
console.log(
  `Service lines: ${claim.service_lines.map((l) => l.cpt).join(", ")}`,
);
console.log("─".repeat(72));

const findings: ClaimFinding[] = [];
let ncciCalls = 0;

async function main() {
const { assessment, engineUsed } = await runClinicalValidation({
  engine: agentCredentialsAvailable() ? "agent" : "mock",
  claim,
  claimId,
  encounterId,
  deterministicFindings: [],
  addFinding: (draft: FindingDraft) => {
    const f = { id: `f-${findings.length}`, claim_id: claimId, ...draft } as ClaimFinding;
    findings.push(f);
    console.log(`  ★ FINDING [${f.severity}] ${f.issue}`);
    return f;
  },
  emitActivity: (text: string) => {
    if (text.toLowerCase().includes("ncci")) ncciCalls++;
    console.log(`  · ${text}`);
  },
  emitAgentStart: (agent, label) => console.log(`  ▶ ${label} (${agent}) started`),
  emitAgentDone: (agent, state, errors, warnings) =>
    console.log(`  ■ ${agent} ${state} — ${errors} error(s), ${warnings} warning(s)`),
});

console.log("─".repeat(72));
console.log(`engine used: ${engineUsed}`);
console.log(`NCCI tool calls observed: ${ncciCalls}`);
console.log(`findings: ${findings.length}`);
if (assessment) {
  console.log(`confidence: ${(assessment.score * 100).toFixed(0)}%`);
  console.log(`rationale: ${assessment.rationale}`);
}
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
