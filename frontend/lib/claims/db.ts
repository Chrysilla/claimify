// Server-only SQLite access for the claims vertical.
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_FILE =
  process.env.CLAIMS_DB_PATH || path.join(process.cwd(), "claimify-claims.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  given TEXT NOT NULL,
  prefix TEXT,
  gender TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  marital_status TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  condition_labels TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  date TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  encounter_class TEXT NOT NULL,
  type_code TEXT,
  type_display TEXT,
  visit_title TEXT,
  status TEXT,
  practitioner_name TEXT,
  practitioner_source_npi TEXT,
  organization_name TEXT
);
CREATE TABLE IF NOT EXISTS conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encounter_id TEXT NOT NULL REFERENCES encounters(id),
  patient_id TEXT NOT NULL,
  snomed TEXT,
  display TEXT,
  onset TEXT,
  clinical_status TEXT
);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encounter_id TEXT NOT NULL REFERENCES encounters(id),
  loinc TEXT,
  display TEXT,
  value_text TEXT,
  unit TEXT,
  effective TEXT
);
CREATE TABLE IF NOT EXISTS procedures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encounter_id TEXT NOT NULL REFERENCES encounters(id),
  snomed TEXT,
  display TEXT,
  performed_start TEXT,
  performed_end TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  encounter_id TEXT PRIMARY KEY REFERENCES encounters(id),
  transcript TEXT NOT NULL,
  note TEXT NOT NULL,
  after_visit_summary TEXT
);
CREATE TABLE IF NOT EXISTS payers (
  payer_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  timely_filing_days INTEGER NOT NULL,
  address TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS eligibility (
  member_id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  payer_id TEXT NOT NULL REFERENCES payers(payer_id),
  plan_name TEXT NOT NULL,
  group_number TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS providers (
  npi TEXT PRIMARY KEY,
  kind TEXT NOT NULL, -- org | individual
  name TEXT NOT NULL,
  taxonomy TEXT NOT NULL,
  tin TEXT,
  address TEXT,
  source_npi TEXT
);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  status TEXT NOT NULL DEFAULT 'draft',
  scenario TEXT,
  claim_json TEXT NOT NULL,
  original_claim_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS validation_jobs (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  status TEXT NOT NULL,
  engine TEXT NOT NULL,
  error TEXT,
  confidence_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  job_id TEXT NOT NULL REFERENCES validation_jobs(id),
  layer TEXT NOT NULL,
  rule_id TEXT,
  severity TEXT NOT NULL,
  loop_segment TEXT,
  field TEXT,
  issue TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  recommended_fix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  created_at TEXT NOT NULL
);
`;

declare global {
  var __claimsDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!globalThis.__claimsDb) {
    const db = new Database(DB_FILE);
    db.pragma("journal_mode = WAL");
    db.exec(SCHEMA);
    globalThis.__claimsDb = db;
  }
  return globalThis.__claimsDb;
}

export function dbExistsAndSeeded(): boolean {
  if (!fs.existsSync(DB_FILE)) return false;
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM encounters")
    .get() as { n: number };
  return row.n > 0;
}
