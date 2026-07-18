// Curated administrative overlays for turning synthetic FHIR encounters into
// draft 837P claims: SNOMED→ICD-10-CM and SNOMED→CPT/HCPCS mappings, mock
// identifier generators, and the deterministic draft-claim builder.
// Pure module — safe to import from the seed script and the validation agent.

import type {
  Address,
  Claim837P,
  Diagnosis,
  ServiceLine,
} from "./types";

// ---------------------------------------------------------------------------
// Dataset record shape (subset of synthetic-ambient-fhir-25 records we read)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DatasetRecord = {
  id: string;
  metadata: {
    date: string;
    visit_title: string;
    status?: string;
    patient_id: string;
    encounter_id: string;
  };
  patient_context: {
    patient: any;
    longitudinal_summary?: { condition_labels?: string[] };
  };
  encounter_fhir: {
    encounter: any;
    related_resources: Record<string, any[]>;
  };
  transcript: string;
  note: string;
  after_visit_summary?: string;
};

// ---------------------------------------------------------------------------
// SNOMED CT → ICD-10-CM (encounter-diagnosis conditions present in dataset)
// ---------------------------------------------------------------------------

export type Icd10Mapping = {
  code: string;
  description: string;
  billable: boolean;
};

export const SNOMED_TO_ICD10: Record<string, Icd10Mapping> = {
  // Disorders
  "59621000": {
    code: "I10",
    description: "Essential (primary) hypertension",
    billable: true,
  },
  "237602007": {
    code: "E88.81",
    description: "Metabolic syndrome",
    billable: true,
  },
  "66383009": {
    code: "K05.10",
    description: "Chronic gingivitis, plaque induced",
    billable: true,
  },
  "18718003": {
    code: "K05.10",
    description: "Chronic gingivitis, plaque induced",
    billable: true,
  },
  "233604007": {
    code: "J18.9",
    description: "Pneumonia, unspecified organism",
    billable: true,
  },
  "389087006": {
    code: "R09.02",
    description: "Hypoxemia",
    billable: true,
  },
  "271825005": {
    code: "R06.03",
    description: "Acute respiratory distress",
    billable: true,
  },
  "162864005": {
    code: "E66.9",
    description: "Obesity, unspecified",
    billable: true,
  },
  "271737000": {
    code: "D64.9",
    description: "Anemia, unspecified",
    billable: true,
  },
  // Findings / Z-codes
  "72892002": {
    code: "Z34.90",
    description:
      "Encounter for supervision of normal pregnancy, unspecified, unspecified trimester",
    billable: true,
  },
  "73595000": {
    code: "Z73.3",
    description: "Stress, not elsewhere classified",
    billable: true,
  },
  "422650009": {
    code: "Z60.4",
    description: "Social exclusion and rejection",
    billable: true,
  },
  // Administrative / social context — not billed on the claim
  "160903007": {
    code: "Z56.9",
    description: "Full-time employment (not billed)",
    billable: false,
  },
  "741062008": {
    code: "Z56.9",
    description: "Not in labor force (not billed)",
    billable: false,
  },
  "73438004": {
    code: "Z56.0",
    description: "Unemployed (not billed)",
    billable: false,
  },
  "160904001": {
    code: "Z56.9",
    description: "Part-time employment (not billed)",
    billable: false,
  },
  "314529007": {
    code: "Z51.81",
    description: "Medication review due (not billed)",
    billable: false,
  },
  "706893006": {
    code: "Z69.11",
    description: "Victim of intimate partner abuse (not billed)",
    billable: false,
  },
};

// ---------------------------------------------------------------------------
// SNOMED CT procedure → separately billable CPT/HCPCS service line
// ---------------------------------------------------------------------------

export type CptMapping = {
  cpt: string;
  description: string;
  charge: number;
  dx?: { code: string; description: string };
};

export const PROCEDURE_TO_CPT: Record<string, CptMapping> = {
  "171207006": {
    cpt: "G0444",
    description: "Annual depression screening, 15 min",
    charge: 18,
    dx: {
      code: "Z13.31",
      description: "Encounter for screening for depression",
    },
  },
  "763302001": {
    cpt: "G0442",
    description: "Annual alcohol misuse screening",
    charge: 18,
    dx: {
      code: "Z13.89",
      description: "Encounter for screening for other disorder",
    },
  },
  "169230002": {
    cpt: "76815",
    description: "Ultrasound, pregnant uterus, limited",
    charge: 110,
  },
  "252160004": {
    cpt: "81025",
    description: "Urine pregnancy test",
    charge: 12,
  },
  "399208008": {
    cpt: "71046",
    description: "Chest X-ray, 2 views",
    charge: 85,
  },
  "90226004": {
    cpt: "88175",
    description: "Cytopathology, cervical/vaginal",
    charge: 55,
  },
  "104091002": {
    cpt: "85025",
    description: "CBC with differential",
    charge: 28,
  },
};

// ---------------------------------------------------------------------------
// Encounter type → evaluation & management line + place of service
// ---------------------------------------------------------------------------

export type EmMapping = {
  cpt: string;
  description: string;
  charge: number;
  pos: string;
};

export const ENCOUNTER_EM: Record<string, EmMapping> = {
  // General examination of patient (AMB)
  "162673000": {
    cpt: "99204",
    description: "Office/outpatient visit, new patient, moderate MDM",
    charge: 175,
    pos: "11",
  },
  // Encounter for check up (AMB)
  "185349003": {
    cpt: "99214",
    description: "Office/outpatient visit, established patient",
    charge: 135,
    pos: "11",
  },
  // Prenatal initial visit (AMB)
  "424441002": {
    cpt: "99204",
    description: "Office/outpatient visit, new patient, moderate MDM",
    charge: 175,
    pos: "11",
  },
  // Hospital admission (IMP)
  "32485007": {
    cpt: "99223",
    description: "Initial hospital inpatient care, high MDM",
    charge: 210,
    pos: "21",
  },
  // Hospital admission for isolation (IMP)
  "1505002": {
    cpt: "99223",
    description: "Initial hospital inpatient care, high MDM",
    charge: 210,
    pos: "21",
  },
  // Admission to hospice (HH)
  "305336008": {
    cpt: "99344",
    description: "Home visit, new patient",
    charge: 160,
    pos: "12",
  },
};

const DEFAULT_EM: EmMapping = {
  cpt: "99214",
  description: "Office/outpatient visit, established patient",
  charge: 135,
  pos: "11",
};

// ---------------------------------------------------------------------------
// Evidence keyword maps (used by the mock clinical validator and the agent)
// ---------------------------------------------------------------------------

export const CPT_EVIDENCE_KEYWORDS: Record<string, string[]> = {
  G0444: ["depression", "PHQ"],
  G0442: ["alcohol", "AUDIT"],
  "99204": ["assessment", "plan"],
  "99214": ["assessment", "plan"],
  "99223": ["assessment", "plan"],
  "99344": ["assessment", "plan"],
  "76815": ["ultrasound"],
  "81025": ["pregnancy test"],
  "71046": ["x-ray", "chest"],
  "88175": ["smear", "cytopathology", "pap"],
  "85025": ["CBC", "hemogram", "blood count"],
  "20610": ["injection", "aspiration", "joint"],
  "99417": ["prolonged"],
};

export const ICD10_EVIDENCE_KEYWORDS: Record<string, string[]> = {
  I10: ["hypertension", "blood pressure", "BP"],
  "E88.81": ["metabolic syndrome"],
  "E66.9": ["BMI", "obesity"],
  "K05.10": ["gingivitis", "gum"],
  "J18.9": ["pneumonia"],
  "R09.02": ["hypoxemia", "oxygen"],
  "R06.03": ["respiratory distress", "breathing"],
  "D64.9": ["anemia", "B12"],
  "Z34.90": ["prenatal", "pregnancy"],
  "Z13.31": ["depression screening", "PHQ"],
  "Z13.89": ["alcohol", "AUDIT"],
  "Z73.3": ["stress"],
  "Z60.4": ["isolation", "social"],
  "N18.3": ["chronic kidney", "CKD"],
  "Z68.30": ["BMI"],
  "Z00.00": ["examination"],
};

// ---------------------------------------------------------------------------
// Deterministic mock identifier generators
// ---------------------------------------------------------------------------

function hashString(input: string): number {
  // xmur3-style string hash → uint32 seed
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(seedKey: string): () => number {
  return mulberry32(hashString(seedKey));
}

function randDigit(rng: () => number): string {
  return String(Math.floor(rng() * 10));
}

/** Luhn check digit computed over "80840" + 9-digit base, per the NPI spec. */
function npiCheckDigit(firstNine: string): string {
  const full = "80840" + firstNine;
  let sum = 0;
  let alternate = true; // rightmost digit of `full` is doubled (check digit appended after)
  for (let i = full.length - 1; i >= 0; i--) {
    let d = full.charCodeAt(i) - 48;
    if (alternate) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alternate = !alternate;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Deterministic, Luhn-valid 10-digit NPI (leading digit 1). */
export function generateNpi(seedKey: string): string {
  const rng = rngFor(`npi:${seedKey}`);
  let nine = "1";
  for (let i = 0; i < 8; i++) nine += randDigit(rng);
  return nine + npiCheckDigit(nine);
}

/** True when `npi` is 10 digits with a valid NPI Luhn check digit. */
export function isValidNpi(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  return npiCheckDigit(npi.slice(0, 9)) === npi[9];
}

// MBI alphabet excludes S, L, O, I, B, Z.
const MBI_LETTERS = "ACDEFGHJKMNPQRTUVWXY";

/** Deterministic 11-char Medicare MBI-like identifier. */
export function generateMbi(seedKey: string): string {
  const rng = rngFor(`mbi:${seedKey}`);
  const digit = () => randDigit(rng);
  const nonZeroDigit = () => String(1 + Math.floor(rng() * 9));
  const letter = () => MBI_LETTERS[Math.floor(rng() * MBI_LETTERS.length)];
  const letterOrDigit = () => (rng() < 0.5 ? letter() : digit());
  return [
    nonZeroDigit(),
    letter(),
    letterOrDigit(),
    digit(),
    letter(),
    letterOrDigit(),
    digit(),
    letter(),
    letter(),
    digit(),
    digit(),
  ].join("");
}

/** Deterministic mock employer TIN, formatted "XX-XXXXXXX". */
export function generateTin(seedKey: string): string {
  const rng = rngFor(`tin:${seedKey}`);
  let digits = "";
  for (let i = 0; i < 9; i++) digits += randDigit(rng);
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

const STREET_NAMES = [
  "Elm St",
  "Maple Ave",
  "Oak St",
  "Pleasant St",
  "Main St",
  "Highland Ave",
  "Park St",
  "Winter St",
  "Summer St",
  "Union St",
];

const STATE_ZIP_PREFIX: Record<string, string> = {
  MA: "01",
  NY: "10",
  CT: "06",
  NH: "03",
  RI: "02",
  VT: "05",
  ME: "04",
};

function generateZip(seedKey: string, state: string): string {
  const rng = rngFor(`zip:${seedKey}`);
  const prefix = STATE_ZIP_PREFIX[state] ?? "01";
  let rest = "";
  for (let i = 0; i < 3; i++) rest += randDigit(rng);
  return prefix + rest;
}

export function generateStreetAddress(seedKey: string): string {
  const rng = rngFor(`street:${seedKey}`);
  const num = 1 + Math.floor(rng() * 980);
  const name = STREET_NAMES[Math.floor(rng() * STREET_NAMES.length)];
  return `${num} ${name}`;
}

export function generateMockAddress(
  seedKey: string,
  city: string,
  state: string,
): Address {
  return {
    line1: generateStreetAddress(seedKey),
    city,
    state,
    zip: generateZip(seedKey, state),
  };
}

// ---------------------------------------------------------------------------
// BMI → Z68 code
// ---------------------------------------------------------------------------

function z68ForBmi(bmi: number): Diagnosis | null {
  if (bmi < 30) return null;
  if (bmi < 40) {
    const decile = Math.min(9, Math.floor(bmi - 30));
    return {
      code: `Z68.3${decile}`,
      description: `Body mass index [BMI] ${30 + decile}.0-${30 + decile}.9, adult`,
    };
  }
  if (bmi < 45)
    return { code: "Z68.41", description: "Body mass index [BMI] 40.0-44.9, adult" };
  if (bmi < 50)
    return { code: "Z68.42", description: "Body mass index [BMI] 45.0-49.9, adult" };
  if (bmi < 60)
    return { code: "Z68.43", description: "Body mass index [BMI] 50.0-59.9, adult" };
  if (bmi < 70)
    return { code: "Z68.44", description: "Body mass index [BMI] 60.0-69.9, adult" };
  return { code: "Z68.45", description: "Body mass index [BMI] 70 or greater, adult" };
}

// ---------------------------------------------------------------------------
// Draft claim builder
// ---------------------------------------------------------------------------

export type DraftClaimInput = {
  record: DatasetRecord;
  orgProvider: {
    npi: string;
    name: string;
    tin: string;
    taxonomy: string;
    address: Address;
  };
  renderingProvider: {
    npi: string;
    first_name: string;
    last_name: string;
    taxonomy: string;
  };
  payer: { payer_id: string; name: string };
  eligibility: { member_id: string; group_number: string };
};

function firstCoding(resource: any): { code?: string; display?: string } {
  return resource?.code?.coding?.[0] ?? {};
}

/** Assemble a clean, internally consistent draft 837P claim for one encounter. */
export function buildDraftClaim(input: DraftClaimInput): Claim837P {
  const { record, orgProvider, renderingProvider, payer, eligibility } = input;
  const encounter = record.encounter_fhir.encounter;
  const related = record.encounter_fhir.related_resources ?? {};
  const patient = record.patient_context.patient;

  const encounterId: string = encounter.id;
  const typeCode: string | undefined =
    encounter?.type?.[0]?.coding?.[0]?.code ?? undefined;
  const em = (typeCode && ENCOUNTER_EM[typeCode]) || DEFAULT_EM;
  const dosFrom: string = String(
    encounter?.period?.start ?? record.metadata.date,
  ).slice(0, 10);

  // --- Diagnoses: billable mapped conditions, disorders first ---------------
  const disorders: Diagnosis[] = [];
  const others: Diagnosis[] = [];
  const seen = new Set<string>();
  const pushDx = (list: Diagnosis[], dx: Diagnosis) => {
    if (seen.has(dx.code)) return;
    seen.add(dx.code);
    list.push(dx);
  };

  for (const condition of related.Condition ?? []) {
    const coding = firstCoding(condition);
    const mapping = coding.code ? SNOMED_TO_ICD10[coding.code] : undefined;
    if (!mapping || !mapping.billable) continue;
    const dx: Diagnosis = { code: mapping.code, description: mapping.description };
    const isDisorder = (coding.display ?? "").includes("(disorder)");
    pushDx(isDisorder ? disorders : others, dx);
  }

  const diagnoses: Diagnosis[] = [...disorders, ...others];

  // --- BMI ≥ 30 → obesity + Z68 code ---------------------------------------
  const bmiObservation = (related.Observation ?? []).find(
    (o: any) => o?.code?.coding?.[0]?.code === "39156-5" && o?.valueQuantity,
  );
  const bmiValue: number | undefined = bmiObservation?.valueQuantity?.value;
  if (typeof bmiValue === "number" && bmiValue >= 30) {
    if (!seen.has("E66.9")) {
      seen.add("E66.9");
      diagnoses.push({ code: "E66.9", description: "Obesity, unspecified" });
    }
    const z68 = z68ForBmi(bmiValue);
    if (z68 && !seen.has(z68.code)) {
      seen.add(z68.code);
      diagnoses.push(z68);
    }
  }

  // --- Service lines --------------------------------------------------------
  const serviceLines: ServiceLine[] = [];
  const usedCpts = new Set<string>();

  const addScreeningDx = (dx: { code: string; description: string }): number => {
    // Returns the 1-based pointer for `dx`, appending it if room remains.
    const existing = diagnoses.findIndex((d) => d.code === dx.code);
    if (existing >= 0) return existing + 1;
    if (diagnoses.length >= 12) return 1; // no room — point at primary dx
    seen.add(dx.code);
    diagnoses.push({ code: dx.code, description: dx.description });
    return diagnoses.length;
  };

  // Line 1: E/M visit pointing at up to 4 primary diagnoses (added after dx
  // assembly below, once fallbacks are known).
  for (const procedure of related.Procedure ?? []) {
    const coding = firstCoding(procedure);
    const mapping = coding.code ? PROCEDURE_TO_CPT[coding.code] : undefined;
    if (!mapping || usedCpts.has(mapping.cpt)) continue;
    usedCpts.add(mapping.cpt);
    const pointers = mapping.dx ? [addScreeningDx(mapping.dx)] : [1];
    serviceLines.push({
      line_number: 0, // renumbered below
      cpt: mapping.cpt,
      modifiers: [],
      description: mapping.description,
      charge: mapping.charge,
      units: 1,
      dos_from: dosFrom,
      diagnosis_pointers: pointers,
    });
  }

  // Fallback when nothing billable was documented.
  if (diagnoses.length === 0) {
    diagnoses.push({
      code: "Z00.00",
      description:
        "Encounter for general adult medical examination without abnormal findings",
    });
  }

  const emPointers = diagnoses.slice(0, 4).map((_, i) => i + 1);
  serviceLines.unshift({
    line_number: 1,
    cpt: em.cpt,
    modifiers: [],
    description: em.description,
    charge: em.charge,
    units: 1,
    dos_from: dosFrom,
    diagnosis_pointers: emPointers,
  });
  serviceLines.forEach((line, i) => (line.line_number = i + 1));

  const totalCharge = serviceLines.reduce(
    (sum, line) => sum + line.charge * line.units,
    0,
  );

  // --- Subscriber -----------------------------------------------------------
  const officialName =
    (patient?.name ?? []).find((n: any) => n.use === "official") ??
    patient?.name?.[0] ??
    {};
  const patientAddress = patient?.address?.[0] ?? {};
  const city: string = patientAddress.city ?? "Boston";
  const state: string = patientAddress.state ?? "MA";
  const gender: "M" | "F" | "U" =
    patient?.gender === "male" ? "M" : patient?.gender === "female" ? "F" : "U";

  return {
    patient_control_number: `CLM-${encounterId.slice(0, 8).toUpperCase()}`,
    total_charge: totalCharge,
    place_of_service: em.pos,
    frequency_code: "1",
    diagnoses: diagnoses.slice(0, 12),
    billing_provider: {
      organization_name: orgProvider.name,
      npi: orgProvider.npi,
      tin: orgProvider.tin,
      taxonomy: orgProvider.taxonomy,
      address: orgProvider.address,
    },
    rendering_provider: {
      npi: renderingProvider.npi,
      first_name: renderingProvider.first_name,
      last_name: renderingProvider.last_name,
      taxonomy: renderingProvider.taxonomy,
    },
    subscriber: {
      member_id: eligibility.member_id,
      group_number: eligibility.group_number,
      last_name: officialName.family ?? "Unknown",
      first_name: officialName.given?.[0] ?? "Unknown",
      dob: patient?.birthDate ?? "",
      gender,
      relationship_code: "18",
      address: {
        line1: generateStreetAddress(patient?.id ?? encounterId),
        city,
        state,
        zip: generateZip(patient?.id ?? encounterId, state),
      },
    },
    payer: {
      payer_id: payer.payer_id,
      name: payer.name,
      claim_filing_indicator: "MB",
    },
    service_lines: serviceLines,
  };
}
