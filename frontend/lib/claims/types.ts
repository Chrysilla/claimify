// Shared 837P claim types. Client-safe: no server imports.

export type Address = {
  line1: string;
  city: string;
  state: string;
  zip: string;
};

export type BillingProvider = {
  organization_name: string;
  npi: string;
  tin: string;
  taxonomy: string;
  address: Address;
};

export type RenderingProvider = {
  npi: string;
  first_name: string;
  last_name: string;
  taxonomy: string;
};

export type Subscriber = {
  member_id: string;
  group_number: string;
  last_name: string;
  first_name: string;
  dob: string;
  gender: "M" | "F" | "U";
  relationship_code: string; // "18" = self
  address: Address;
};

export type PayerInfo = {
  payer_id: string;
  name: string;
  claim_filing_indicator: string; // "MB" = Medicare Part B
};

export type Diagnosis = {
  code: string; // ICD-10-CM
  description: string;
};

export type ServiceLine = {
  line_number: number;
  cpt: string;
  modifiers: string[];
  description: string;
  charge: number;
  units: number;
  dos_from: string; // YYYY-MM-DD
  dos_to?: string;
  place_of_service?: string; // overrides claim-level POS
  diagnosis_pointers: number[]; // 1-based indexes into diagnoses (A=1..L=12)
};

export type Claim837P = {
  patient_control_number: string; // CLM01
  total_charge: number; // CLM02
  place_of_service: string; // CLM05-1
  frequency_code: string; // CLM05-3: 1 original, 7 replacement, 8 void
  original_claim_number?: string; // 2300 REF*F8, required when frequency 7/8
  prior_authorization?: string; // 2300 REF*G1
  onset_date?: string;
  diagnoses: Diagnosis[]; // up to 12 (HI, ABK/ABF)
  billing_provider: BillingProvider; // 2010AA
  rendering_provider: RenderingProvider; // 2310B
  subscriber: Subscriber; // 2010BA
  payer: PayerInfo; // 2010BB
  service_lines: ServiceLine[]; // 2400
};

export type ClaimImportResult = {
  claim: Claim837P;
  engine: "anthropic" | "mock";
  warnings: string[];
};

export type DemoJsonSummary = {
  file: string;
  label: string;
  description: string | null;
  severity: string | null;
  patient_name: string;
  total_charge: number;
  line_count: number;
};

export type ClaimStatus = "draft" | "submitted" | "validating" | "validated";

export type ClaimSummary = {
  id: string;
  encounter_id: string;
  patient_id: string;
  patient_name: string;
  visit_title: string;
  encounter_date: string;
  encounter_class: string;
  status: ClaimStatus;
  scenario: string | null;
  total_charge: number;
  line_count: number;
  latest_confidence: number | null;
  finding_count: number;
};

export type ClaimDetail = {
  id: string;
  encounter_id: string;
  patient_id: string;
  status: ClaimStatus;
  scenario: string | null;
  claim: Claim837P;
  encounter: {
    visit_title: string;
    date: string;
    period_start: string;
    period_end: string;
    encounter_class: string;
    type_display: string;
    practitioner_name: string;
    organization_name: string;
  };
  patient_name: string;
  latest_job: ValidationJob | null;
  findings: ClaimFinding[];
};

export type FindingSeverity = "error" | "warning" | "info";
export type FindingLayer = "structural" | "content" | "clinical";

export type FindingEvidence = {
  source_type: string; // note | transcript | fhir | claim | rule | eligibility | registry
  source_id: string;
  label: string;
  excerpt: string;
};

export type ClaimFinding = {
  id: string;
  claim_id: string;
  job_id: string;
  layer: FindingLayer;
  rule_id: string | null;
  severity: FindingSeverity;
  loop_segment: string | null; // e.g. "2010BA NM109"
  field: string | null;
  issue: string;
  why_it_matters: string;
  evidence: FindingEvidence[];
  recommended_fix: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
};

export type ConfidenceBreakdown = {
  category: string;
  score: number; // 0..1
  note: string;
};

export type ConfidenceReport = {
  score: number; // 0..1 probability the claim is accepted by Medicare
  rationale: string;
  breakdown: ConfidenceBreakdown[];
};

export type JobStatus =
  | "pending"
  | "structural"
  | "content"
  | "clinical"
  | "scoring"
  | "complete"
  | "failed";

export type ValidationJob = {
  id: string;
  claim_id: string;
  status: JobStatus;
  engine: "agent" | "mock";
  error: string | null;
  confidence: ConfidenceReport | null;
  started_at: string;
  finished_at: string | null;
};

export type JobEvent =
  | { type: "status"; status: JobStatus; engine?: "agent" | "mock" }
  | {
      type: "layer";
      layer: FindingLayer;
      state: "start" | "pass" | "fail";
      errors?: number;
      warnings?: number;
    }
  | { type: "finding"; finding: ClaimFinding }
  | { type: "agent_activity"; text: string }
  | { type: "confidence"; confidence: ConfidenceReport }
  | { type: "done"; job: ValidationJob }
  | { type: "error"; message: string };
