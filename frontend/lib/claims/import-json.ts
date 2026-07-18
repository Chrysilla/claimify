// Import an 837P claim from the mock JSON files in the repo-root `demo-data/`
// folder (server-only). Those files use an external clearinghouse 837P schema, so
// this maps them into the internal Claim837P shape the editor/validators expect.
import fs from "fs";
import path from "path";
import type { Claim837P, DemoJsonSummary, Diagnosis, ServiceLine } from "./types";

// Walk up from the server cwd (frontend/) to find the repo-root demo-data dir.
function demoDataDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, "demo-data");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("demo-data folder not found");
}

type ExternalAddress = {
  line?: string;
  city?: string;
  stateCode?: string;
  zipCode?: string;
};

type ExternalPerson = {
  firstName?: string;
  lastNameOrOrgName?: string;
  birthDate?: string;
  gender?: string;
  identifier?: string;
  address?: ExternalAddress;
};

type ExternalCode = { code?: string; desc?: string; formattedCode?: string };

type ExternalServiceLine = {
  chargeAmount?: number;
  serviceDateFrom?: string;
  serviceDateTo?: string;
  unitCount?: number;
  procedure?: ExternalCode;
  modifiers?: ExternalCode[];
  diagPointers?: number[];
};

type ExternalClaim = {
  patientControlNumber?: string;
  chargeAmount?: number;
  facilityCode?: ExternalCode;
  frequencyCode?: ExternalCode;
  subscriber?: {
    groupOrPolicyNumber?: string;
    claimFilingIndicatorCode?: string;
    person?: ExternalPerson;
    payer?: ExternalPerson;
  };
  patient?: { relationshipType?: string; person?: ExternalPerson };
  billingProvider?: ExternalPerson & {
    taxId?: string;
    providerTaxonomy?: ExternalCode;
  };
  diags?: ExternalCode[];
  serviceLines?: ExternalServiceLine[];
  _mismatch?: { type?: string; severity?: string; description?: string };
};

function mapGender(g?: string): "M" | "F" | "U" {
  if (g === "MALE" || g === "M") return "M";
  if (g === "FEMALE" || g === "F") return "F";
  return "U";
}

const RELATIONSHIP_CODES: Record<string, string> = {
  SELF: "18",
  SPOUSE: "01",
  CHILD: "19",
  OTHER: "G8",
};

function mapAddress(a?: ExternalAddress) {
  return {
    line1: a?.line ?? "",
    city: a?.city ?? "",
    state: a?.stateCode ?? "",
    zip: a?.zipCode ?? "",
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function mapExternalClaim(raw: ExternalClaim): Claim837P {
  const diagnoses: Diagnosis[] = (raw.diags ?? []).map((d) => ({
    code: d.formattedCode || d.code || "",
    description: d.desc ?? "",
  }));

  const service_lines: ServiceLine[] = (raw.serviceLines ?? []).map(
    (l, i): ServiceLine => ({
      line_number: i + 1,
      cpt: l.procedure?.code ?? "",
      modifiers: (l.modifiers ?? [])
        .map((m) => m.code ?? "")
        .filter(Boolean),
      description: l.procedure?.desc ?? "",
      charge: l.chargeAmount ?? 0,
      units: l.unitCount && l.unitCount > 0 ? l.unitCount : 1,
      dos_from: l.serviceDateFrom ?? "",
      dos_to: l.serviceDateTo,
      diagnosis_pointers: Array.from(new Set(l.diagPointers ?? []))
        .filter((p) => p >= 1 && p <= diagnoses.length)
        .sort((a, b) => a - b),
    }),
  );

  const sub = raw.subscriber ?? {};
  const subPerson = sub.person ?? {};
  const payer = sub.payer ?? {};
  const patient = raw.patient ?? {};
  const bp = raw.billingProvider ?? {};

  const lineSum = round2(service_lines.reduce((s, l) => s + (l.charge || 0), 0));

  return {
    patient_control_number: raw.patientControlNumber ?? "",
    total_charge: raw.chargeAmount ?? lineSum,
    place_of_service: raw.facilityCode?.code ?? "11",
    frequency_code: raw.frequencyCode?.code ?? "1",
    diagnoses,
    billing_provider: {
      organization_name: bp.lastNameOrOrgName ?? "",
      npi: bp.identifier ?? "",
      tin: bp.taxId ?? "",
      taxonomy: bp.providerTaxonomy?.code ?? "",
      address: mapAddress(bp.address),
    },
    rendering_provider: { npi: "", first_name: "", last_name: "", taxonomy: "" },
    subscriber: {
      member_id: subPerson.identifier ?? "",
      group_number: sub.groupOrPolicyNumber ?? "",
      last_name: subPerson.lastNameOrOrgName ?? "",
      first_name: subPerson.firstName ?? "",
      dob: subPerson.birthDate ?? "",
      gender: mapGender(subPerson.gender),
      relationship_code:
        RELATIONSHIP_CODES[patient.relationshipType ?? "SELF"] ?? "18",
      // External schema carries the address on the patient block.
      address: mapAddress(patient.person?.address ?? subPerson.address),
    },
    payer: {
      payer_id: payer.identifier ?? "",
      name: payer.lastNameOrOrgName ?? "",
      claim_filing_indicator: sub.claimFilingIndicatorCode ?? "MB",
    },
    service_lines,
  };
}

function humanizeType(type?: string): string {
  if (!type) return "Clean sample";
  return type
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function listDemoJson(): DemoJsonSummary[] {
  const dir = demoDataDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = JSON.parse(
        fs.readFileSync(path.join(dir, file), "utf-8"),
      ) as ExternalClaim;
      const claim = mapExternalClaim(raw);
      return {
        file,
        label: humanizeType(raw._mismatch?.type),
        description: raw._mismatch?.description ?? null,
        severity: raw._mismatch?.severity ?? null,
        patient_name:
          `${claim.subscriber.first_name} ${claim.subscriber.last_name}`.trim() ||
          "Unknown",
        total_charge: claim.total_charge,
        line_count: claim.service_lines.length,
      };
    });
}

export function loadDemoJson(file: string): Claim837P {
  const dir = demoDataDir();
  const safe = path.basename(file); // guard against path traversal
  const full = path.join(dir, safe);
  if (!safe.toLowerCase().endsWith(".json") || !fs.existsSync(full)) {
    throw new Error("demo_file_not_found");
  }
  const raw = JSON.parse(fs.readFileSync(full, "utf-8")) as ExternalClaim;
  return mapExternalClaim(raw);
}
