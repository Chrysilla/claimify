// Server-side read models shared by the API routes.
import { randomUUID } from "crypto";
import { getDb } from "./db";
import type { Claim837P, ClaimDetail, ClaimStatus, ClaimSummary, ConfidenceReport } from "./types";
import { getFindingsForClaim, getLatestJobForClaim } from "./jobs";

// Manually created / imported claims have no seeded FHIR encounter. Foreign keys
// are enforced, so they reference a shared placeholder patient/encounter whose
// display fields are empty; the LEFT JOINs below then fall back to the claim JSON.
const MANUAL_ID = "__manual__";

function ensureManualRefs(db: ReturnType<typeof getDb>): void {
  db.prepare(
    `INSERT OR IGNORE INTO patients (id, family, given, gender, birth_date)
     VALUES (?, '', '', 'U', '')`,
  ).run(MANUAL_ID);
  db.prepare(
    `INSERT OR IGNORE INTO encounters (id, patient_id, date, period_start, period_end, encounter_class)
     VALUES (?, ?, '', '', '', '')`,
  ).run(MANUAL_ID, MANUAL_ID);
}

function claimPatientName(claim: Claim837P): string {
  const name = `${claim.subscriber.first_name} ${claim.subscriber.last_name}`.trim();
  return name || "New claim";
}

function earliestDos(claim: Claim837P): string {
  const dates = claim.service_lines
    .map((l) => l.dos_from)
    .filter(Boolean)
    .sort();
  return dates[0] ?? "";
}

export function emptyClaim(): Claim837P {
  return {
    patient_control_number: "",
    total_charge: 0,
    place_of_service: "11",
    frequency_code: "1",
    diagnoses: [{ code: "", description: "" }],
    billing_provider: {
      organization_name: "",
      npi: "",
      tin: "",
      taxonomy: "",
      address: { line1: "", city: "", state: "", zip: "" },
    },
    rendering_provider: { npi: "", first_name: "", last_name: "", taxonomy: "" },
    subscriber: {
      member_id: "",
      group_number: "",
      last_name: "",
      first_name: "",
      dob: "",
      gender: "U",
      relationship_code: "18",
      address: { line1: "", city: "", state: "", zip: "" },
    },
    payer: { payer_id: "", name: "", claim_filing_indicator: "MB" },
    service_lines: [
      {
        line_number: 1,
        cpt: "",
        modifiers: [],
        description: "",
        charge: 0,
        units: 1,
        dos_from: "",
        diagnosis_pointers: [],
      },
    ],
  };
}

// Creates a new draft claim (blank or from an imported claim) with no linked
// encounter, and returns its full detail.
export function createClaim(claim?: Claim837P): ClaimDetail {
  const db = getDb();
  ensureManualRefs(db);
  const id = `clm-new-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const json = JSON.stringify(claim ?? emptyClaim());
  db.prepare(
    `INSERT INTO claims (id, encounter_id, patient_id, status, scenario, claim_json, original_claim_json, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', NULL, ?, ?, ?, ?)`,
  ).run(id, MANUAL_ID, MANUAL_ID, json, json, now, now);
  return getClaimDetail(id)!;
}

export function getClaimSummaries(): ClaimSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.encounter_id, c.patient_id, c.status, c.scenario, c.claim_json, c.created_at,
              e.visit_title, e.date, e.encounter_class,
              p.prefix, p.given, p.family,
              (SELECT COUNT(*) FROM findings f WHERE f.claim_id = c.id
                 AND f.job_id = (SELECT id FROM validation_jobs vj WHERE vj.claim_id = c.id ORDER BY vj.started_at DESC LIMIT 1)) AS finding_count,
              (SELECT vj.confidence_json FROM validation_jobs vj
                 WHERE vj.claim_id = c.id AND vj.status = 'complete'
                 ORDER BY vj.started_at DESC LIMIT 1) AS confidence_json
       FROM claims c
       LEFT JOIN encounters e ON e.id = c.encounter_id
       LEFT JOIN patients p ON p.id = c.patient_id
       ORDER BY COALESCE(NULLIF(e.date, ''), c.created_at) DESC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((row) => {
    const claim = JSON.parse(row.claim_json as string) as Claim837P;
    const confidence = row.confidence_json
      ? (JSON.parse(row.confidence_json as string) as ConfidenceReport)
      : null;
    // Fall back to the claim JSON for manually created / imported claims that
    // have no linked encounter or patient row.
    const patientName = row.given
      ? `${row.given} ${row.family}`
      : claimPatientName(claim);
    const date =
      ((row.date as string) || earliestDos(claim) || (row.created_at as string)) ??
      "";
    return {
      id: row.id as string,
      encounter_id: row.encounter_id as string,
      patient_id: row.patient_id as string,
      patient_name: patientName,
      visit_title: (row.visit_title as string) || "Manual / imported claim",
      encounter_date: date.slice(0, 10),
      encounter_class: (row.encounter_class as string) || "—",
      status: row.status as ClaimStatus,
      scenario: (row.scenario as string) ?? null,
      total_charge: claim.total_charge,
      line_count: claim.service_lines.length,
      latest_confidence: confidence?.score ?? null,
      finding_count: (row.finding_count as number) ?? 0,
    };
  });
}

export function getClaimDetail(id: string): ClaimDetail | null {
  const row = getDb()
    .prepare(
      `SELECT c.*, e.visit_title, e.date, e.period_start, e.period_end, e.encounter_class,
              e.type_display, e.practitioner_name, e.organization_name,
              p.given, p.family
       FROM claims c
       LEFT JOIN encounters e ON e.id = c.encounter_id
       LEFT JOIN patients p ON p.id = c.patient_id
       WHERE c.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const claim = JSON.parse(row.claim_json as string) as Claim837P;
  const hasEncounter = Boolean(row.date);
  return {
    id: row.id as string,
    encounter_id: row.encounter_id as string,
    patient_id: row.patient_id as string,
    status: row.status as ClaimStatus,
    scenario: (row.scenario as string) ?? null,
    claim,
    // For manual / imported claims (no linked encounter) derive the header from
    // the claim itself so the editor still shows meaningful context.
    encounter: {
      visit_title:
        (row.visit_title as string) ||
        (hasEncounter ? "" : "Manual / imported claim"),
      date: (((row.date as string) || earliestDos(claim)) ?? "").slice(0, 10),
      period_start: (row.period_start as string) ?? "",
      period_end: (row.period_end as string) ?? "",
      encounter_class: (row.encounter_class as string) || "—",
      type_display: (row.type_display as string) ?? "",
      practitioner_name:
        (row.practitioner_name as string) ||
        `${claim.rendering_provider.first_name} ${claim.rendering_provider.last_name}`.trim(),
      organization_name:
        (row.organization_name as string) ||
        claim.billing_provider.organization_name,
    },
    patient_name: row.given
      ? `${row.given} ${row.family}`
      : claimPatientName(claim),
    latest_job: getLatestJobForClaim(id),
    findings: getFindingsForClaim(id),
  };
}

export function saveClaim(
  id: string,
  claim: Claim837P,
  scenario: string | null,
): ClaimDetail | null {
  const db = getDb();
  const exists = db.prepare("SELECT id FROM claims WHERE id = ?").get(id);
  if (!exists) return null;
  db.prepare(
    "UPDATE claims SET claim_json = ?, scenario = ?, status = 'draft', updated_at = ? WHERE id = ?",
  ).run(JSON.stringify(claim), scenario, new Date().toISOString(), id);
  return getClaimDetail(id);
}

// Restores the pristine generated claim and clears prior validation runs so the
// demo can return to a known-good draft without re-seeding.
export function resetClaim(id: string): ClaimDetail | null {
  const db = getDb();
  const row = db
    .prepare("SELECT original_claim_json FROM claims WHERE id = ?")
    .get(id) as { original_claim_json: string } | undefined;
  if (!row) return null;
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      "DELETE FROM findings WHERE job_id IN (SELECT id FROM validation_jobs WHERE claim_id = ?)",
    ).run(id);
    db.prepare("DELETE FROM validation_jobs WHERE claim_id = ?").run(id);
    db.prepare(
      "UPDATE claims SET claim_json = original_claim_json, scenario = NULL, status = 'draft', updated_at = ? WHERE id = ?",
    ).run(now, id);
  });
  tx();
  return getClaimDetail(id);
}
