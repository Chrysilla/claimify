// Deterministic 837P validation — layer 1 (structural) and layer 2 (content).
// Pure functions: cross-check data arrives via ValidationContext, no DB access.
import type { Claim837P, ClaimFinding, FindingEvidence, ServiceLine } from "./types";
import { getRule } from "./rules";

export type FindingDraft = Omit<
  ClaimFinding,
  "id" | "claim_id" | "job_id" | "status" | "review_note" | "created_at"
>;

export type ValidationContext = {
  encounter: {
    id: string;
    period_start: string;
    period_end: string;
    encounter_class: string;
  } | null;
  patient: {
    id: string;
    family: string;
    given: string;
    gender: string;
    birth_date: string;
  } | null;
  eligibility: {
    member_id: string;
    patient_id: string;
    payer_id: string;
    active: number;
    effective_from: string;
    effective_to: string | null;
  } | null;
  providerNpis: Set<string>;
  payer: { payer_id: string; timely_filing_days: number } | null;
  today: string; // YYYY-MM-DD
};

const ICD10_RE = /^[A-TV-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;
const CPT_HCPCS_RE = /^(\d{4}[0-9A-Z]|[A-Z]\d{4})$/;
const MODIFIER_RE = /^[A-Z0-9]{2}$/;
const POS_RE = /^\d{2}$/;

const POS_BY_CLASS: Record<string, string[]> = {
  AMB: ["11", "22", "49"],
  IMP: ["21"],
  HH: ["12", "31", "32"],
};

function blank(value: string | undefined | null): boolean {
  return !value || value.trim() === "";
}

function claimEvidence(field: string, value: string): FindingEvidence {
  return {
    source_type: "claim",
    source_id: field,
    label: `Claim field ${field}`,
    excerpt: value,
  };
}

function fromRule(
  ruleId: string,
  overrides: Partial<FindingDraft> & { evidence: FindingEvidence[] },
): FindingDraft {
  const rule = getRule(ruleId);
  if (!rule) {
    throw new Error(`Unknown rule ${ruleId}`);
  }
  return {
    layer: rule.layer,
    rule_id: rule.id,
    severity: rule.severity,
    loop_segment: rule.loop_segment,
    field: rule.field,
    issue: rule.message,
    why_it_matters: rule.why,
    recommended_fix: rule.fix,
    ...overrides,
  };
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function lineLabel(line: ServiceLine): string {
  return `Line ${line.line_number} (${line.cpt || "no code"})`;
}

// ---------------------------------------------------------------------------
// NPI check digit: Luhn over the 80840 prefix + first nine digits.
// ---------------------------------------------------------------------------
export function npiIsValid(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  const base = `80840${npi.slice(0, 9)}`;
  let sum = 0;
  let double = true; // rightmost digit of the base is doubled
  for (let i = base.length - 1; i >= 0; i--) {
    let digit = base.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === npi.charCodeAt(9) - 48;
}

// ---------------------------------------------------------------------------
// Layer 1 — structural (S-001..S-015)
// ---------------------------------------------------------------------------
export function runStructuralChecks(claim: Claim837P): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const sub = claim.subscriber;
  const billing = claim.billing_provider;
  const rendering = claim.rendering_provider;

  if (blank(sub?.member_id)) {
    findings.push(
      fromRule("S-001", {
        evidence: [claimEvidence("subscriber.member_id", "(empty)")],
      }),
    );
  }

  const missingDemo: string[] = [];
  if (blank(sub?.last_name)) missingDemo.push("last name");
  if (blank(sub?.first_name)) missingDemo.push("first name");
  if (blank(sub?.dob)) missingDemo.push("date of birth");
  if (missingDemo.length > 0) {
    findings.push(
      fromRule("S-002", {
        issue: `The subscriber's ${missingDemo.join(", ")} is missing.`,
        evidence: [
          claimEvidence(
            "subscriber",
            `${sub?.last_name || "(no last name)"}, ${sub?.first_name || "(no first name)"} · DOB ${sub?.dob || "(none)"}`,
          ),
        ],
      }),
    );
  }

  if (blank(claim.payer?.payer_id) || blank(claim.payer?.name)) {
    findings.push(
      fromRule("S-003", {
        evidence: [
          claimEvidence(
            "payer",
            `${claim.payer?.name || "(no payer name)"} · ID ${claim.payer?.payer_id || "(none)"}`,
          ),
        ],
      }),
    );
  }

  if (blank(billing?.npi)) {
    findings.push(
      fromRule("S-004", {
        evidence: [claimEvidence("billing_provider.npi", "(empty)")],
      }),
    );
  }
  if (blank(billing?.tin)) {
    findings.push(
      fromRule("S-005", {
        evidence: [claimEvidence("billing_provider.tin", "(empty)")],
      }),
    );
  }
  if (blank(billing?.taxonomy)) {
    findings.push(
      fromRule("S-006", {
        evidence: [claimEvidence("billing_provider.taxonomy", "(empty)")],
      }),
    );
  }

  const addr = billing?.address;
  const missingAddr: string[] = [];
  if (blank(addr?.line1)) missingAddr.push("street");
  if (blank(addr?.city)) missingAddr.push("city");
  if (blank(addr?.state)) missingAddr.push("state");
  if (blank(addr?.zip)) missingAddr.push("ZIP");
  if (missingAddr.length > 0) {
    findings.push(
      fromRule("S-007", {
        issue: `The billing provider address is missing: ${missingAddr.join(", ")}.`,
        evidence: [
          claimEvidence(
            "billing_provider.address",
            `${addr?.line1 || "(no street)"}, ${addr?.city || "(no city)"}, ${addr?.state || "??"} ${addr?.zip || ""}`,
          ),
        ],
      }),
    );
  }

  if (blank(rendering?.npi)) {
    findings.push(
      fromRule("S-008", {
        evidence: [claimEvidence("rendering_provider.npi", "(empty)")],
      }),
    );
  }

  const diagnoses = claim.diagnoses ?? [];
  if (diagnoses.length === 0) {
    findings.push(
      fromRule("S-009", {
        evidence: [claimEvidence("diagnoses", "0 diagnosis codes submitted")],
      }),
    );
  }

  const lines = claim.service_lines ?? [];
  if (lines.length === 0) {
    findings.push(
      fromRule("S-010", {
        evidence: [claimEvidence("service_lines", "0 service lines submitted")],
      }),
    );
  }

  if (lines.length > 0) {
    const lineTotal = lines.reduce(
      (sum, line) => sum + (Number.isFinite(line.charge) ? line.charge : 0),
      0,
    );
    if (Math.abs(lineTotal - (claim.total_charge ?? 0)) > 0.005) {
      findings.push(
        fromRule("S-011", {
          issue: `Claim total ${money(claim.total_charge ?? 0)} does not equal the sum of line charges ${money(lineTotal)}.`,
          evidence: [
            claimEvidence(
              "total_charge",
              `CLM02 ${money(claim.total_charge ?? 0)} vs Σ SV102 ${money(lineTotal)} across ${lines.length} line(s)`,
            ),
          ],
        }),
      );
    }
  }

  for (const line of lines) {
    const badPointers = (line.diagnosis_pointers ?? []).filter(
      (p) => !Number.isInteger(p) || p < 1 || p > 12 || p > diagnoses.length,
    );
    if (badPointers.length > 0) {
      findings.push(
        fromRule("S-012", {
          issue: `${lineLabel(line)} points to diagnosis position ${badPointers.join(", ")}, but the claim lists only ${diagnoses.length} diagnosis code(s).`,
          evidence: [
            claimEvidence(
              `service_lines[${line.line_number}].diagnosis_pointers`,
              `Pointers [${(line.diagnosis_pointers ?? []).join(", ")}] against ${diagnoses.length} diagnosis code(s)`,
            ),
          ],
        }),
      );
    }
  }

  const seen = new Map<string, ServiceLine>();
  for (const line of lines) {
    const key = `${line.cpt}|${[...(line.modifiers ?? [])].sort().join(",")}|${line.dos_from}`;
    const first = seen.get(key);
    if (first) {
      findings.push(
        fromRule("S-013", {
          issue: `${lineLabel(line)} duplicates line ${first.line_number}: same procedure ${line.cpt}, same modifiers, same date of service ${line.dos_from}.`,
          evidence: [
            claimEvidence(
              `service_lines[${line.line_number}]`,
              `${line.cpt} on ${line.dos_from} billed on lines ${first.line_number} and ${line.line_number}`,
            ),
          ],
        }),
      );
    } else {
      seen.set(key, line);
    }
  }

  const freq = claim.frequency_code?.trim();
  if (!["1", "7", "8"].includes(freq ?? "")) {
    findings.push(
      fromRule("S-014", {
        issue: `Claim frequency code "${freq || "(empty)"}" is not a valid value (1, 7, or 8).`,
        evidence: [claimEvidence("frequency_code", freq || "(empty)")],
      }),
    );
  } else if (
    (freq === "7" || freq === "8") &&
    blank(claim.original_claim_number)
  ) {
    findings.push(
      fromRule("S-014", {
        issue: `Frequency code ${freq} (${freq === "7" ? "replacement" : "void"}) requires the original claim number, which is missing.`,
        evidence: [
          claimEvidence(
            "original_claim_number",
            `Frequency ${freq} with no 2300 REF*F8 value`,
          ),
        ],
      }),
    );
  }

  if (blank(claim.patient_control_number)) {
    findings.push(
      fromRule("S-015", {
        evidence: [claimEvidence("patient_control_number", "(empty)")],
      }),
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Layer 2 — content and cross-checks (C-101..C-113)
// ---------------------------------------------------------------------------
export function runContentChecks(
  claim: Claim837P,
  ctx: ValidationContext,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const diagnoses = claim.diagnoses ?? [];
  const lines = claim.service_lines ?? [];

  diagnoses.forEach((dx, index) => {
    if (!blank(dx.code) && !ICD10_RE.test(dx.code.trim())) {
      findings.push(
        fromRule("C-101", {
          issue: `Diagnosis ${String.fromCharCode(65 + index)} ("${dx.code}") is not a valid ICD-10-CM code format.`,
          evidence: [
            claimEvidence(`diagnoses[${index + 1}].code`, dx.code),
          ],
        }),
      );
    }
  });

  for (const line of lines) {
    if (!blank(line.cpt) && !CPT_HCPCS_RE.test(line.cpt.trim())) {
      findings.push(
        fromRule("C-102", {
          issue: `${lineLabel(line)} procedure code "${line.cpt}" is not a valid CPT/HCPCS format.`,
          evidence: [
            claimEvidence(`service_lines[${line.line_number}].cpt`, line.cpt),
          ],
        }),
      );
    }
  }

  const npiChecks: { field: string; label: string; npi: string }[] = [];
  if (!blank(claim.billing_provider?.npi)) {
    npiChecks.push({
      field: "billing_provider.npi",
      label: "Billing provider",
      npi: claim.billing_provider.npi.trim(),
    });
  }
  if (!blank(claim.rendering_provider?.npi)) {
    npiChecks.push({
      field: "rendering_provider.npi",
      label: "Rendering provider",
      npi: claim.rendering_provider.npi.trim(),
    });
  }
  for (const check of npiChecks) {
    if (!npiIsValid(check.npi)) {
      findings.push(
        fromRule("C-103", {
          issue: `${check.label} NPI ${check.npi} fails check-digit validation.`,
          evidence: [claimEvidence(check.field, check.npi)],
        }),
      );
    } else if (!ctx.providerNpis.has(check.npi)) {
      findings.push(
        fromRule("C-104", {
          issue: `${check.label} NPI ${check.npi} is not in the payer's enrolled-provider registry.`,
          evidence: [
            claimEvidence(check.field, check.npi),
            {
              source_type: "registry",
              source_id: "provider-registry",
              label: "Payer provider registry",
              excerpt: `Registry lookup for NPI ${check.npi}: no enrolled provider found (${ctx.providerNpis.size} providers on file).`,
            },
          ],
        }),
      );
    }
  }

  const encStart = ctx.encounter?.period_start?.slice(0, 10) ?? null;
  const encEnd = ctx.encounter?.period_end?.slice(0, 10) ?? null;
  for (const line of lines) {
    const dosFrom = line.dos_from?.trim() ?? "";
    const dosTo = (line.dos_to ?? line.dos_from)?.trim() ?? "";
    if (blank(dosFrom)) continue;

    if (encStart && encEnd && (dosFrom < encStart || dosTo > encEnd)) {
      findings.push(
        fromRule("C-105", {
          issue: `${lineLabel(line)} bills date of service ${dosFrom}${dosTo !== dosFrom ? `–${dosTo}` : ""}, but the documented encounter ran ${encStart}${encEnd !== encStart ? `–${encEnd}` : " only"}.`,
          evidence: [
            claimEvidence(
              `service_lines[${line.line_number}].dos_from`,
              dosFrom,
            ),
            {
              source_type: "fhir",
              source_id: ctx.encounter?.id ?? "encounter",
              label: "Documented encounter period",
              excerpt: `Encounter period ${encStart} → ${encEnd}`,
            },
          ],
        }),
      );
    }

    if (dosFrom > ctx.today) {
      findings.push(
        fromRule("C-106", {
          issue: `${lineLabel(line)} bills date of service ${dosFrom}, which is after today (${ctx.today}).`,
          evidence: [
            claimEvidence(
              `service_lines[${line.line_number}].dos_from`,
              dosFrom,
            ),
          ],
        }),
      );
    }
  }

  const posChecks: { field: string; pos: string }[] = [];
  if (!blank(claim.place_of_service)) {
    posChecks.push({
      field: "place_of_service",
      pos: claim.place_of_service.trim(),
    });
  }
  for (const line of lines) {
    if (!blank(line.place_of_service)) {
      posChecks.push({
        field: `service_lines[${line.line_number}].place_of_service`,
        pos: (line.place_of_service as string).trim(),
      });
    }
  }
  const allowedPos = ctx.encounter
    ? POS_BY_CLASS[ctx.encounter.encounter_class]
    : undefined;
  const flaggedPos = new Set<string>();
  for (const check of posChecks) {
    const key = `${check.field}|${check.pos}`;
    if (flaggedPos.has(key)) continue;
    if (!POS_RE.test(check.pos)) {
      flaggedPos.add(key);
      findings.push(
        fromRule("C-107", {
          issue: `Place of service "${check.pos}" is not a valid two-digit POS code.`,
          evidence: [claimEvidence(check.field, check.pos)],
        }),
      );
    } else if (allowedPos && !allowedPos.includes(check.pos)) {
      flaggedPos.add(key);
      findings.push(
        fromRule("C-107", {
          issue: `Place of service ${check.pos} is inconsistent with the documented ${describeClass(ctx.encounter!.encounter_class)} encounter (expected ${allowedPos.join(" or ")}).`,
          evidence: [
            claimEvidence(check.field, check.pos),
            {
              source_type: "fhir",
              source_id: ctx.encounter!.id,
              label: "Documented encounter setting",
              excerpt: `Encounter class ${ctx.encounter!.encounter_class} (${describeClass(ctx.encounter!.encounter_class)})`,
            },
          ],
        }),
      );
    }
  }

  for (const line of lines) {
    const badUnits = !Number.isFinite(line.units) || line.units < 1;
    const badCharge = !Number.isFinite(line.charge) || line.charge < 0;
    if (badUnits || badCharge) {
      findings.push(
        fromRule("C-108", {
          issue: `${lineLabel(line)} has ${badUnits ? `invalid units (${line.units})` : ""}${badUnits && badCharge ? " and " : ""}${badCharge ? `an invalid charge (${money(line.charge ?? 0)})` : ""}.`,
          evidence: [
            claimEvidence(
              `service_lines[${line.line_number}]`,
              `units ${line.units}, charge ${money(line.charge ?? 0)}`,
            ),
          ],
        }),
      );
    }
  }

  for (const line of lines) {
    for (const modifier of line.modifiers ?? []) {
      if (!MODIFIER_RE.test(modifier.trim().toUpperCase())) {
        findings.push(
          fromRule("C-109", {
            issue: `${lineLabel(line)} modifier "${modifier}" is not a valid two-character modifier.`,
            evidence: [
              claimEvidence(
                `service_lines[${line.line_number}].modifiers`,
                modifier,
              ),
            ],
          }),
        );
      }
    }
  }

  // Eligibility cross-checks. The caller looks up the eligibility record by
  // patient + payer; its absence means the payer has no coverage on file.
  const earliestDos = lines
    .map((line) => line.dos_from)
    .filter((d) => !blank(d))
    .sort()[0];
  const memberId = claim.subscriber?.member_id?.trim() ?? "";
  if (ctx.eligibility === null) {
    if (ctx.patient) {
      findings.push(
        fromRule("C-110", {
          issue: `The payer's eligibility file has no coverage on record for this patient.`,
          evidence: [
            {
              source_type: "eligibility",
              source_id: "eligibility-file",
              label: "Payer eligibility file",
              excerpt: `No eligibility record found for patient ${ctx.patient.given} ${ctx.patient.family} with payer ${claim.payer?.payer_id || "(unknown)"}.`,
            },
          ],
        }),
      );
    }
  } else {
    const elig = ctx.eligibility;
    const eligWindow = `${elig.effective_from} → ${elig.effective_to ?? "present"}`;
    if (!blank(memberId) && memberId !== elig.member_id) {
      findings.push(
        fromRule("C-111", {
          issue: `Submitted member ID ${memberId} does not match the eligibility file, which lists ${elig.member_id} for this patient.`,
          evidence: [
            claimEvidence("subscriber.member_id", memberId),
            {
              source_type: "eligibility",
              source_id: elig.member_id,
              label: "Payer eligibility file",
              excerpt: `Eligibility file: member ${elig.member_id}, ${elig.active ? "active" : "inactive"} ${eligWindow}`,
            },
          ],
        }),
      );
    }
    if (earliestDos) {
      const withinWindow =
        earliestDos >= elig.effective_from &&
        (elig.effective_to === null || earliestDos <= elig.effective_to);
      if (!elig.active || !withinWindow) {
        findings.push(
          fromRule("C-110", {
            issue: `No active coverage on the date of service ${earliestDos}: the eligibility file shows member ${elig.member_id} ${elig.active ? "covered" : "inactive"} ${eligWindow}.`,
            evidence: [
              {
                source_type: "eligibility",
                source_id: elig.member_id,
                label: "Payer eligibility file",
                excerpt: `Eligibility file: member ${elig.member_id} ${elig.active ? "active" : "inactive"} ${eligWindow}; claim DOS ${earliestDos}.`,
              },
            ],
          }),
        );
      }
    }
  }

  if (ctx.payer && earliestDos) {
    const deadline = addDays(earliestDos, ctx.payer.timely_filing_days);
    if (ctx.today > deadline) {
      findings.push(
        fromRule("C-112", {
          issue: `The earliest date of service is ${earliestDos}; the payer's ${ctx.payer.timely_filing_days}-day filing window closed on ${deadline}.`,
          evidence: [
            {
              source_type: "rule",
              source_id: "timely-filing",
              label: "Payer timely filing policy",
              excerpt: `Payer ${ctx.payer.payer_id} requires filing within ${ctx.payer.timely_filing_days} days of the date of service.`,
            },
          ],
        }),
      );
    }
  }

  if (ctx.patient) {
    const chartGender =
      ctx.patient.gender === "male"
        ? "M"
        : ctx.patient.gender === "female"
          ? "F"
          : "U";
    const dobMismatch =
      !blank(claim.subscriber?.dob) &&
      claim.subscriber.dob !== ctx.patient.birth_date;
    const genderMismatch =
      claim.subscriber?.gender && claim.subscriber.gender !== chartGender;
    if (dobMismatch || genderMismatch) {
      findings.push(
        fromRule("C-113", {
          issue: `Claim demographics differ from the chart: ${
            dobMismatch
              ? `DOB ${claim.subscriber.dob} vs chart ${ctx.patient.birth_date}`
              : ""
          }${dobMismatch && genderMismatch ? "; " : ""}${
            genderMismatch
              ? `gender ${claim.subscriber.gender} vs chart ${chartGender}`
              : ""
          }.`,
          evidence: [
            claimEvidence(
              "subscriber",
              `DOB ${claim.subscriber?.dob || "(none)"} · gender ${claim.subscriber?.gender || "(none)"}`,
            ),
            {
              source_type: "fhir",
              source_id: ctx.patient.id,
              label: "Patient chart demographics",
              excerpt: `Chart: ${ctx.patient.given} ${ctx.patient.family}, DOB ${ctx.patient.birth_date}, ${ctx.patient.gender}`,
            },
          ],
        }),
      );
    }
  }

  return findings;
}

function describeClass(encounterClass: string): string {
  switch (encounterClass) {
    case "AMB":
      return "ambulatory/office";
    case "IMP":
      return "inpatient";
    case "HH":
      return "home health";
    default:
      return encounterClass;
  }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
