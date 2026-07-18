// Server-only patient-review store. Loads the fictional demo fixtures from
// demo/*.json and keeps findings in memory (deterministic mock AI — no backend).
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Finding, Patient } from "@/lib/types";

type RawPatient = {
  id: string;
  name: string;
  date_of_birth: string;
  primary_condition: string;
  payer: string;
  workflow_status: string;
  risk_level: "low" | "medium" | "high";
  diagnoses?: Record<string, string>[];
  medications?: Record<string, string>[];
};

function demoDir(): string {
  // Walk up from cwd to find the repo's demo/ fixtures (works from frontend/ or root).
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    const candidate = path.join(dir, "demo", "patients.json");
    if (fs.existsSync(candidate)) return path.join(dir, "demo");
    dir = path.dirname(dir);
  }
  throw new Error("demo/ fixtures not found (looked from " + process.cwd() + ")");
}

function read<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(demoDir(), name), "utf-8")) as T;
}

function buildPatients(): Map<string, Patient> {
  const raw = read<RawPatient[]>("patients.json");
  const labsByPatient = new Map<string, Record<string, string>[]>();
  const notesByPatient = new Map<string, Record<string, string>[]>();
  for (const lab of read<Record<string, string>[]>("labs.json")) {
    const { patient_id, ...rest } = lab;
    (labsByPatient.get(patient_id) ?? labsByPatient.set(patient_id, []).get(patient_id)!).push(rest);
  }
  for (const note of read<Record<string, string>[]>("clinical-notes.json")) {
    const { patient_id, ...rest } = note;
    (notesByPatient.get(patient_id) ?? notesByPatient.set(patient_id, []).get(patient_id)!).push(rest);
  }
  const insurance = new Map<string, Record<string, unknown>>();
  for (const cov of read<Record<string, unknown>[]>("insurance.json")) {
    insurance.set(cov.patient_id as string, cov);
  }
  const rules = new Map<string, Record<string, unknown>>();
  for (const rule of read<Record<string, unknown>[]>("payer-rules.json")) {
    rules.set(rule.id as string, rule);
  }

  const map = new Map<string, Patient>();
  for (const p of raw) {
    const cov = { ...(insurance.get(p.id) ?? {}) };
    const ruleIds = (cov.payer_rule_ids as string[] | undefined) ?? [];
    delete cov.payer_rule_ids;
    delete cov.patient_id;
    map.set(p.id, {
      id: p.id,
      name: p.name,
      date_of_birth: p.date_of_birth,
      primary_condition: p.primary_condition,
      payer: p.payer,
      workflow_status: p.workflow_status,
      risk_level: p.risk_level,
      is_demo: true,
      diagnoses: p.diagnoses ?? [],
      medications: p.medications ?? [],
      labs: labsByPatient.get(p.id) ?? [],
      notes: notesByPatient.get(p.id) ?? [],
      insurance: cov as Record<string, string>,
      payer_rules: ruleIds.map((id) => rules.get(id) as Record<string, string>).filter(Boolean),
    });
  }
  return map;
}

type FindingSeed = Omit<
  Finding,
  "id" | "patient_id" | "status" | "review_note"
>;

// Deterministic mock findings, mirroring the original backend mock provider.
function mockReview(patientId: string): FindingSeed[] {
  if (patientId === "maya-thompson") {
    return [
      {
        issue: "Conservative-treatment duration is not documented",
        why_it_matters:
          "The fictional payer rule requires six weeks of conservative treatment before lumbar MRI authorization; the note only says treatment was attempted.",
        evidence: [
          {
            source_type: "clinical_note",
            source_id: "note-maya-2026-07-11",
            label: "Orthopedics note · Jul 11",
            excerpt:
              "Patient has tried physical therapy and NSAIDs without adequate relief.",
          },
          {
            source_type: "payer_rule",
            source_id: "rule-northstar-lumbar-mri",
            label: "Northstar lumbar MRI policy",
            excerpt:
              "Document at least six weeks of conservative therapy, including dates and response.",
          },
        ],
        confidence: 0.96,
        recommended_action:
          "Add physical-therapy start and end dates, NSAID duration, and response to the authorization note before submission.",
      },
    ];
  }
  if (patientId === "elena-rodriguez") {
    return [
      {
        issue: "Diagnosis code lacks laterality",
        why_it_matters:
          "The procedure request describes the right knee, but the diagnosis is recorded without laterality, creating a coding mismatch.",
        evidence: [
          {
            source_type: "clinical_note",
            source_id: "note-elena-2026-07-15",
            label: "Sports medicine note · Jul 15",
            excerpt: "Persistent right knee pain and swelling after injury.",
          },
        ],
        confidence: 0.89,
        recommended_action:
          "Confirm the diagnosis and update the code with right-side specificity before claim submission.",
      },
    ];
  }
  return [];
}

declare global {
  var __patientStore:
    | { patients: Map<string, Patient>; findings: Map<string, Finding> }
    | undefined;
}

function store() {
  if (!globalThis.__patientStore) {
    globalThis.__patientStore = { patients: buildPatients(), findings: new Map() };
  }
  return globalThis.__patientStore;
}

export function listPatients(): Patient[] {
  return [...store().patients.values()];
}

export function getPatient(id: string): Patient | null {
  return store().patients.get(id) ?? null;
}

export function listFindings(patientId?: string): Finding[] {
  const all = [...store().findings.values()];
  const filtered = patientId ? all.filter((f) => f.patient_id === patientId) : all;
  return filtered.sort((a, b) => (a.id < b.id ? 1 : -1));
}

export function getFinding(id: string): Finding | null {
  return store().findings.get(id) ?? null;
}

// Runs the (mock) review for a patient, replacing any prior findings for them.
export function runReview(patientId: string): Finding[] {
  const s = store();
  for (const [id, f] of s.findings) {
    if (f.patient_id === patientId) s.findings.delete(id);
  }
  const created: Finding[] = mockReview(patientId).map((seed) => ({
    ...seed,
    id: randomUUID(),
    patient_id: patientId,
    status: "pending",
    review_note: null,
  }));
  for (const f of created) s.findings.set(f.id, f);
  return created;
}

export function editFinding(id: string, recommendedAction: string): Finding {
  const finding = store().findings.get(id);
  if (!finding) throw new Error("finding_not_found");
  if (finding.status !== "pending") throw new Error("finding_already_reviewed");
  finding.recommended_action = recommendedAction;
  return finding;
}

export function decideFinding(
  id: string,
  status: "approved" | "rejected",
  note?: string,
): Finding {
  const finding = store().findings.get(id);
  if (!finding) throw new Error("finding_not_found");
  if (finding.status !== "pending") throw new Error("finding_already_reviewed");
  finding.status = status;
  finding.review_note = note ?? null;
  return finding;
}
