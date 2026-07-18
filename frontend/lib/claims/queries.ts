// Server-side read models shared by the API routes.
import { getDb } from "./db";
import type { Claim837P, ClaimDetail, ClaimStatus, ClaimSummary, ConfidenceReport } from "./types";
import { getFindingsForClaim, getLatestJobForClaim } from "./jobs";

export function getClaimSummaries(): ClaimSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.encounter_id, c.patient_id, c.status, c.scenario, c.claim_json,
              e.visit_title, e.date, e.encounter_class,
              p.prefix, p.given, p.family,
              (SELECT COUNT(*) FROM findings f WHERE f.claim_id = c.id
                 AND f.job_id = (SELECT id FROM validation_jobs vj WHERE vj.claim_id = c.id ORDER BY vj.started_at DESC LIMIT 1)) AS finding_count,
              (SELECT vj.confidence_json FROM validation_jobs vj
                 WHERE vj.claim_id = c.id AND vj.status = 'complete'
                 ORDER BY vj.started_at DESC LIMIT 1) AS confidence_json
       FROM claims c
       JOIN encounters e ON e.id = c.encounter_id
       JOIN patients p ON p.id = c.patient_id
       ORDER BY e.date DESC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((row) => {
    const claim = JSON.parse(row.claim_json as string) as Claim837P;
    const confidence = row.confidence_json
      ? (JSON.parse(row.confidence_json as string) as ConfidenceReport)
      : null;
    return {
      id: row.id as string,
      encounter_id: row.encounter_id as string,
      patient_id: row.patient_id as string,
      patient_name: `${row.given} ${row.family}`,
      visit_title: (row.visit_title as string) ?? "",
      encounter_date: ((row.date as string) ?? "").slice(0, 10),
      encounter_class: (row.encounter_class as string) ?? "",
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
       JOIN encounters e ON e.id = c.encounter_id
       JOIN patients p ON p.id = c.patient_id
       WHERE c.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    encounter_id: row.encounter_id as string,
    patient_id: row.patient_id as string,
    status: row.status as ClaimStatus,
    scenario: (row.scenario as string) ?? null,
    claim: JSON.parse(row.claim_json as string) as Claim837P,
    encounter: {
      visit_title: (row.visit_title as string) ?? "",
      date: ((row.date as string) ?? "").slice(0, 10),
      period_start: (row.period_start as string) ?? "",
      period_end: (row.period_end as string) ?? "",
      encounter_class: (row.encounter_class as string) ?? "",
      type_display: (row.type_display as string) ?? "",
      practitioner_name: (row.practitioner_name as string) ?? "",
      organization_name: (row.organization_name as string) ?? "",
    },
    patient_name: `${row.given} ${row.family}`,
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
