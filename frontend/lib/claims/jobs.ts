// Validation job orchestration: runs the three layers, persists findings,
// and fans events out to SSE subscribers with replay for late joiners.
import { randomUUID } from "crypto";
import { getDb } from "./db";
import type {
  Claim837P,
  ClaimFinding,
  ConfidenceReport,
  JobEvent,
  JobStatus,
  SpecialistId,
  ValidationJob,
} from "./types";
import {
  runStructuralChecks,
  runContentChecks,
  type FindingDraft,
  type ValidationContext,
} from "./validate";
import { scoreFromFindings } from "./scoring";
import { agentCredentialsAvailable, runClinicalValidation } from "./agent";

type JobChannel = {
  events: JobEvent[];
  listeners: Set<(e: JobEvent) => void>;
  closed: boolean;
};

declare global {
  var __claimsJobChannels: Map<string, JobChannel> | undefined;
}

function channels(): Map<string, JobChannel> {
  return (globalThis.__claimsJobChannels ??= new Map());
}

function channel(jobId: string): JobChannel {
  let ch = channels().get(jobId);
  if (!ch) {
    ch = { events: [], listeners: new Set(), closed: false };
    channels().set(jobId, ch);
  }
  return ch;
}

function emit(jobId: string, event: JobEvent): void {
  const ch = channel(jobId);
  ch.events.push(event);
  if (event.type === "done" || event.type === "error") ch.closed = true;
  for (const listener of ch.listeners) listener(event);
}

/** Replays buffered events, then delivers live ones. Returns an unsubscribe fn. */
export function subscribeToJob(
  jobId: string,
  onEvent: (e: JobEvent) => void,
): () => void {
  const ch = channels().get(jobId);
  if (ch) {
    for (const e of ch.events) onEvent(e);
    if (ch.closed) return () => {};
    ch.listeners.add(onEvent);
    return () => ch.listeners.delete(onEvent);
  }
  // No live channel (e.g. server restarted): synthesize a replay from the DB.
  for (const e of replayFromDb(jobId)) onEvent(e);
  return () => {};
}

function rowToJob(row: Record<string, unknown>): ValidationJob {
  return {
    id: row.id as string,
    claim_id: row.claim_id as string,
    status: row.status as JobStatus,
    engine: row.engine as "agent" | "mock",
    error: (row.error as string) ?? null,
    confidence: row.confidence_json
      ? (JSON.parse(row.confidence_json as string) as ConfidenceReport)
      : null,
    started_at: row.started_at as string,
    finished_at: (row.finished_at as string) ?? null,
  };
}

function rowToFinding(row: Record<string, unknown>): ClaimFinding {
  return {
    id: row.id as string,
    claim_id: row.claim_id as string,
    job_id: row.job_id as string,
    layer: row.layer as ClaimFinding["layer"],
    rule_id: (row.rule_id as string) ?? null,
    severity: row.severity as ClaimFinding["severity"],
    loop_segment: (row.loop_segment as string) ?? null,
    field: (row.field as string) ?? null,
    agent: (row.agent as SpecialistId) ?? null,
    issue: row.issue as string,
    why_it_matters: row.why_it_matters as string,
    evidence: JSON.parse((row.evidence_json as string) || "[]"),
    recommended_fix: row.recommended_fix as string,
    status: row.status as ClaimFinding["status"],
    review_note: (row.review_note as string) ?? null,
    created_at: row.created_at as string,
  };
}

function replayFromDb(jobId: string): JobEvent[] {
  const db = getDb();
  const jobRow = db
    .prepare("SELECT * FROM validation_jobs WHERE id = ?")
    .get(jobId) as Record<string, unknown> | undefined;
  if (!jobRow) return [{ type: "error", message: "Unknown validation job." }];
  const job = rowToJob(jobRow);
  const findings = (
    db
      .prepare("SELECT * FROM findings WHERE job_id = ? ORDER BY created_at")
      .all(jobId) as Record<string, unknown>[]
  ).map(rowToFinding);
  const events: JobEvent[] = [{ type: "status", status: job.status, engine: job.engine }];
  for (const finding of findings) events.push({ type: "finding", finding });
  if (job.confidence) events.push({ type: "confidence", confidence: job.confidence });
  if (job.status === "complete") events.push({ type: "done", job });
  else if (job.status === "failed")
    events.push({ type: "error", message: job.error ?? "Validation failed." });
  else events.push({ type: "error", message: "Job interrupted by server restart. Re-submit the claim." });
  return events;
}

export function getJob(jobId: string): ValidationJob | null {
  const row = getDb()
    .prepare("SELECT * FROM validation_jobs WHERE id = ?")
    .get(jobId) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export function getFindingsForClaim(claimId: string): ClaimFinding[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM findings WHERE claim_id = ? AND job_id = (SELECT id FROM validation_jobs WHERE claim_id = ? ORDER BY started_at DESC LIMIT 1) ORDER BY created_at",
    )
    .all(claimId, claimId) as Record<string, unknown>[];
  return rows.map(rowToFinding);
}

export function getLatestJobForClaim(claimId: string): ValidationJob | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM validation_jobs WHERE claim_id = ? ORDER BY started_at DESC LIMIT 1",
    )
    .get(claimId) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

function setJobStatus(jobId: string, status: JobStatus, engine?: "agent" | "mock"): void {
  const db = getDb();
  if (engine) {
    db.prepare("UPDATE validation_jobs SET status = ?, engine = ? WHERE id = ?").run(
      status,
      engine,
      jobId,
    );
  } else {
    db.prepare("UPDATE validation_jobs SET status = ? WHERE id = ?").run(status, jobId);
  }
  emit(jobId, { type: "status", status, engine });
}

function insertFinding(
  claimId: string,
  jobId: string,
  draft: FindingDraft,
): ClaimFinding {
  const finding: ClaimFinding = {
    ...draft,
    id: randomUUID(),
    claim_id: claimId,
    job_id: jobId,
    status: "pending",
    review_note: null,
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO findings (id, claim_id, job_id, layer, rule_id, severity, loop_segment, field, agent, issue, why_it_matters, evidence_json, recommended_fix, status, review_note, created_at)
       VALUES (@id, @claim_id, @job_id, @layer, @rule_id, @severity, @loop_segment, @field, @agent, @issue, @why_it_matters, @evidence_json, @recommended_fix, @status, @review_note, @created_at)`,
    )
    .run({
      ...finding,
      agent: finding.agent ?? null,
      evidence_json: JSON.stringify(finding.evidence),
    } as unknown as Record<string, unknown>);
  return finding;
}

function buildValidationContext(claim: Claim837P, encounterId: string): ValidationContext {
  const db = getDb();
  const encounter = db
    .prepare(
      "SELECT id, period_start, period_end, encounter_class FROM encounters WHERE id = ?",
    )
    .get(encounterId) as ValidationContext["encounter"];
  const patientRow = encounter
    ? (db
        .prepare(
          "SELECT p.id, p.family, p.given, p.gender, p.birth_date FROM patients p JOIN encounters e ON e.patient_id = p.id WHERE e.id = ?",
        )
        .get(encounterId) as ValidationContext["patient"])
    : null;
  const eligibility = patientRow
    ? (db
        .prepare(
          "SELECT member_id, patient_id, payer_id, active, effective_from, effective_to FROM eligibility WHERE patient_id = ?",
        )
        .get(patientRow.id) as ValidationContext["eligibility"])
    : null;
  const npiRows = db.prepare("SELECT npi FROM providers").all() as { npi: string }[];
  const payer = db
    .prepare("SELECT payer_id, timely_filing_days FROM payers WHERE payer_id = ?")
    .get(claim.payer.payer_id) as ValidationContext["payer"];
  return {
    encounter: encounter ?? null,
    patient: patientRow ?? null,
    eligibility: eligibility ?? null,
    providerNpis: new Set(npiRows.map((r) => r.npi)),
    payer: payer ?? null,
    today: new Date().toISOString().slice(0, 10),
  };
}

function layerCounts(findings: ClaimFinding[], layer: ClaimFinding["layer"]) {
  const inLayer = findings.filter((f) => f.layer === layer);
  return {
    errors: inLayer.filter((f) => f.severity === "error").length,
    warnings: inLayer.filter((f) => f.severity === "warning").length,
  };
}

export function startValidationJob(claimId: string): { job_id: string } {
  const db = getDb();
  const claimRow = db.prepare("SELECT * FROM claims WHERE id = ?").get(claimId) as
    | { id: string; encounter_id: string; claim_json: string }
    | undefined;
  if (!claimRow) throw new Error("claim_not_found");
  const claim = JSON.parse(claimRow.claim_json) as Claim837P;
  const engine: "agent" | "mock" = agentCredentialsAvailable() ? "agent" : "mock";
  const jobId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO validation_jobs (id, claim_id, status, engine, started_at) VALUES (?, ?, 'pending', ?, ?)",
  ).run(jobId, claimId, engine, now);
  db.prepare("UPDATE claims SET status = 'validating', updated_at = ? WHERE id = ?").run(
    now,
    claimId,
  );
  channel(jobId); // create the channel before any subscriber can race
  void runJob(jobId, claimId, claimRow.encounter_id, claim, engine).catch((error) => {
    const message = error instanceof Error ? error.message : "Validation failed.";
    getDb()
      .prepare(
        "UPDATE validation_jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
      )
      .run(message, new Date().toISOString(), jobId);
    emit(jobId, { type: "error", message });
  });
  return { job_id: jobId };
}

async function runJob(
  jobId: string,
  claimId: string,
  encounterId: string,
  claim: Claim837P,
  engine: "agent" | "mock",
): Promise<void> {
  const db = getDb();
  const all: ClaimFinding[] = [];
  const add = (draft: FindingDraft): ClaimFinding => {
    const finding = insertFinding(claimId, jobId, draft);
    all.push(finding);
    emit(jobId, { type: "finding", finding });
    return finding;
  };

  // Layer 1 — structural
  setJobStatus(jobId, "structural", engine);
  emit(jobId, { type: "layer", layer: "structural", state: "start" });
  for (const draft of runStructuralChecks(claim)) add(draft);
  const s = layerCounts(all, "structural");
  emit(jobId, {
    type: "layer",
    layer: "structural",
    state: s.errors > 0 ? "fail" : "pass",
    ...s,
  });

  // Layer 2 — content & coding
  setJobStatus(jobId, "content");
  emit(jobId, { type: "layer", layer: "content", state: "start" });
  const ctx = buildValidationContext(claim, encounterId);
  for (const draft of runContentChecks(claim, ctx)) add(draft);
  const c = layerCounts(all, "content");
  emit(jobId, {
    type: "layer",
    layer: "content",
    state: c.errors > 0 ? "fail" : "pass",
    ...c,
  });

  // Layer 3 — clinical evidence (agentic)
  setJobStatus(jobId, "clinical");
  emit(jobId, { type: "layer", layer: "clinical", state: "start" });
  const { assessment, engineUsed } = await runClinicalValidation({
    engine,
    claim,
    claimId,
    encounterId,
    deterministicFindings: [...all],
    addFinding: add,
    emitActivity: (text) => emit(jobId, { type: "agent_activity", text }),
    emitAgentStart: (agent, label) =>
      emit(jobId, { type: "agent_start", agent, label }),
    emitAgentDone: (agent, state, errors, warnings) =>
      emit(jobId, { type: "agent_done", agent, state, errors, warnings }),
  });
  if (engineUsed !== engine) setJobStatus(jobId, "clinical", engineUsed);
  const m = layerCounts(all, "clinical");
  emit(jobId, {
    type: "layer",
    layer: "clinical",
    state: m.errors > 0 ? "fail" : "pass",
    ...m,
  });

  // Scoring
  setJobStatus(jobId, "scoring");
  const confidence = scoreFromFindings(all, assessment ?? undefined);
  const finishedAt = new Date().toISOString();
  db.prepare(
    "UPDATE validation_jobs SET status = 'complete', confidence_json = ?, finished_at = ? WHERE id = ?",
  ).run(JSON.stringify(confidence), finishedAt, jobId);
  db.prepare("UPDATE claims SET status = 'validated', updated_at = ? WHERE id = ?").run(
    finishedAt,
    claimId,
  );
  emit(jobId, { type: "confidence", confidence });
  const job = getJob(jobId);
  if (job) emit(jobId, { type: "done", job });
}
