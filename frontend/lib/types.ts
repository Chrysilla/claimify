export type Evidence = {
  source_type: string;
  source_id: string;
  label: string;
  excerpt: string;
};
export type Finding = {
  id: string;
  patient_id: string;
  issue: string;
  why_it_matters: string;
  evidence: Evidence[];
  confidence: number;
  recommended_action: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
};
export type Patient = {
  id: string;
  name: string;
  date_of_birth: string;
  primary_condition: string;
  payer: string;
  workflow_status: string;
  risk_level: "low" | "medium" | "high";
  is_demo: boolean;
  diagnoses?: Record<string, string>[];
  medications?: Record<string, string>[];
  labs?: Record<string, string>[];
  notes?: Record<string, string>[];
  insurance?: Record<string, string>;
  payer_rules?: Record<string, string>[];
};
