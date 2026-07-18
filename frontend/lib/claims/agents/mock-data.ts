// Small, curated reference tables for the deterministic mock specialists (used
// when no ANTHROPIC_API_KEY is present). These are intentionally tiny — just
// enough to make the demo scenarios in demo-data/ produce realistic findings.
// The real agents consult the full NCCI manual instead.

// E/M code range (professional office/outpatient + others). Used to detect the
// classic "E/M same day as a minor procedure without modifier 25" edit.
export function isEmCode(cpt: string): boolean {
  const n = Number(cpt);
  return Number.isInteger(n) && n >= 99202 && n <= 99499;
}

// Minor surgical / procedure codes carry a global period; billing an E/M the
// same day requires modifier 25 to show a separately identifiable service.
export function isMinorProcedure(cpt: string): boolean {
  const n = Number(cpt);
  if (!Number.isInteger(n)) return false;
  return n >= 10000 && n <= 69999; // CPT surgical ranges
}

// NCCI PTP (procedure-to-procedure) edit pairs: `column2` is bundled into
// `column1` and denied on the same date of service unless a modifier (usually
// 59 or an X{EPSU}) shows the services were distinct. Illustrative subset.
export type PtpPair = {
  column1: string;
  column2: string;
  label: string;
};

export const MOCK_PTP_PAIRS: PtpPair[] = [
  { column1: "80053", column2: "80048", label: "comprehensive metabolic panel (80053) already includes the basic metabolic panel (80048)" },
  { column1: "44970", column2: "44950", label: "laparoscopic appendectomy (44970) and open appendectomy (44950) are mutually exclusive approaches" },
  { column1: "45385", column2: "45380", label: "colonoscopy w/ lesion removal bundles diagnostic biopsy" },
  { column1: "29881", column2: "29870", label: "knee arthroscopy w/ meniscectomy bundles diagnostic arthroscopy" },
  { column1: "11042", column2: "97597", label: "surgical debridement bundles active wound care management" },
  { column1: "93000", column2: "93005", label: "ECG w/ interpretation bundles tracing-only ECG" },
];

// ICD-10-CM codes that encode a body side, and the side they mean. Used to
// cross-check diagnosis laterality against a service line's RT/LT modifier.
export const ICD10_LATERALITY: Record<string, "RT" | "LT"> = {
  "M17.11": "RT", // unilateral primary osteoarthritis, right knee
  "M17.12": "LT", // unilateral primary osteoarthritis, left knee
  "M17.31": "RT",
  "M17.32": "LT",
  "M25.511": "RT", // pain in right shoulder
  "M25.512": "LT", // pain in left shoulder
  "M25.561": "RT", // pain in right knee
  "M25.562": "LT", // pain in left knee
  "H66.91": "RT", // otitis media, right ear
  "H66.92": "LT", // otitis media, left ear
  "S82.101": "RT",
  "S82.102": "LT",
};

// ICD-10-CM codes with unspecified laterality/site where a more specific code is
// available; payers increasingly deny unspecified codes when specificity exists.
export const UNSPECIFIED_LATERALITY_ICD10: Record<string, string> = {
  "M17.10": "unilateral primary osteoarthritis, unspecified knee (specify right M17.11 / left M17.12)",
  "M17.9": "osteoarthritis of knee, unspecified",
  "M25.519": "pain in unspecified shoulder",
  "M25.569": "pain in unspecified knee",
  "H66.90": "otitis media, unspecified ear",
  "S82.109": "unspecified fracture of unspecified lower leg",
};
