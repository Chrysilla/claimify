// Seed the claims SQLite database from the synthetic-ambient-fhir-25 dataset.
// Run from the frontend directory: npx tsx scripts/seed-claims.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");

const DB_PATH =
  process.env.CLAIMS_DB_PATH || path.join(frontendDir, "claimify-claims.db");
process.env.CLAIMS_DB_PATH = DB_PATH;

const DATASET_PATH =
  process.env.DATASET_PATH ||
  path.resolve(
    frontendDir,
    "../synthetic-ambient-fhir-25/synthetic-ambient-fhir-25.jsonl",
  );

/* eslint-disable @typescript-eslint/no-explicit-any */

async function main() {
  if (!fs.existsSync(DATASET_PATH)) {
    console.error(
      `Dataset not found at ${DATASET_PATH}.\n` +
        "Place synthetic-ambient-fhir-25.jsonl there or set DATASET_PATH.",
    );
    process.exit(1);
  }

  for (const suffix of ["", "-wal", "-shm"]) {
    const file = DB_PATH + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  const { getDb } = await import("../lib/claims/db");
  const {
    buildDraftClaim,
    generateMbi,
    generateNpi,
    generateTin,
    generateMockAddress,
    isValidNpi,
  } = await import("../lib/claims/overlays");
  type DatasetRecord = import("../lib/claims/overlays").DatasetRecord;

  const records: DatasetRecord[] = fs
    .readFileSync(DATASET_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));

  const db = getDb();
  const now = new Date().toISOString();

  const insertPatient = db.prepare(
    `INSERT OR IGNORE INTO patients
     (id, family, given, prefix, gender, birth_date, marital_status, city, state, country, condition_labels)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEncounter = db.prepare(
    `INSERT INTO encounters
     (id, patient_id, date, period_start, period_end, encounter_class, type_code, type_display,
      visit_title, status, practitioner_name, practitioner_source_npi, organization_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertCondition = db.prepare(
    `INSERT INTO conditions (encounter_id, patient_id, snomed, display, onset, clinical_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertObservation = db.prepare(
    `INSERT INTO observations (encounter_id, loinc, display, value_text, unit, effective)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertProcedure = db.prepare(
    `INSERT INTO procedures (encounter_id, snomed, display, performed_start, performed_end)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertDocument = db.prepare(
    `INSERT INTO documents (encounter_id, transcript, note, after_visit_summary)
     VALUES (?, ?, ?, ?)`,
  );
  const insertPayer = db.prepare(
    `INSERT INTO payers (payer_id, name, kind, timely_filing_days, address)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertEligibility = db.prepare(
    `INSERT OR IGNORE INTO eligibility
     (member_id, patient_id, payer_id, plan_name, group_number, effective_from, effective_to, active)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 1)`,
  );
  const insertProvider = db.prepare(
    `INSERT OR IGNORE INTO providers (npi, kind, name, taxonomy, tin, address, source_npi)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, encounter_id, patient_id, status, scenario, claim_json, original_claim_json, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', NULL, ?, ?, ?, ?)`,
  );

  // --- Payer ---------------------------------------------------------------
  const payer = {
    payer_id: "MCARE-MB-01",
    name: "Medicare Part B (Mock MAC J14)",
  };
  insertPayer.run(
    payer.payer_id,
    payer.name,
    "medicare",
    365,
    JSON.stringify({
      line1: "75 William Terry Dr",
      city: "Hingham",
      state: "MA",
      zip: "02043",
    }),
  );

  // --- Pre-scan providers ---------------------------------------------------
  type OrgInfo = { name: string; city: string; state: string };
  type PractitionerInfo = {
    sourceNpi: string;
    display: string;
    prenatal: boolean;
  };
  const orgs = new Map<string, OrgInfo>();
  const practitioners = new Map<string, PractitionerInfo>();

  const encounterOf = (record: DatasetRecord) => record.encounter_fhir.encounter;
  const practitionerRefOf = (record: DatasetRecord): { npi: string; display: string } => {
    const participant = encounterOf(record)?.participant?.[0]?.individual ?? {};
    const reference: string = participant.reference ?? "";
    const npi = reference.includes("|") ? reference.split("|").pop()! : "";
    return { npi, display: participant.display ?? "Unknown Practitioner" };
  };

  for (const record of records) {
    const encounter = encounterOf(record);
    const orgName: string =
      encounter?.serviceProvider?.display ?? "Unknown Organization";
    const patientAddress = record.patient_context.patient?.address?.[0] ?? {};
    if (!orgs.has(orgName)) {
      orgs.set(orgName, {
        name: orgName,
        city: patientAddress.city ?? "Boston",
        state: patientAddress.state ?? "MA",
      });
    }
    const { npi: sourceNpi, display } = practitionerRefOf(record);
    const typeCode = encounter?.type?.[0]?.coding?.[0]?.code;
    const existing = practitioners.get(sourceNpi);
    const prenatal = typeCode === "424441002";
    if (existing) {
      existing.prenatal = existing.prenatal || prenatal;
    } else {
      practitioners.set(sourceNpi, { sourceNpi, display, prenatal });
    }
  }

  const orgProviders = new Map<
    string,
    { npi: string; name: string; tin: string; taxonomy: string; address: any }
  >();
  for (const org of orgs.values()) {
    const npi = generateNpi(`org:${org.name}`);
    orgProviders.set(org.name, {
      npi,
      name: org.name,
      tin: generateTin(`org:${org.name}`),
      taxonomy: "261QP2300X",
      address: generateMockAddress(`org:${org.name}`, org.city, org.state),
    });
  }

  const cleanName = (raw: string) => raw.replace(/\d+/g, "").trim();
  const splitPractitioner = (display: string) => {
    const cleaned = cleanName(display).replace(/^Dr\.?\s+/i, "");
    const parts = cleaned.split(/\s+/);
    return {
      first: parts[0] ?? "Unknown",
      last: parts.slice(1).join(" ") || "Provider",
    };
  };

  const individualProviders = new Map<
    string,
    { npi: string; first_name: string; last_name: string; taxonomy: string; sourceNpi: string }
  >();
  for (const practitioner of practitioners.values()) {
    const npi = generateNpi(`practitioner:${practitioner.sourceNpi}`);
    const { first, last } = splitPractitioner(practitioner.display);
    individualProviders.set(practitioner.sourceNpi, {
      npi,
      first_name: first,
      last_name: last,
      taxonomy: practitioner.prenatal ? "207V00000X" : "207Q00000X",
      sourceNpi: practitioner.sourceNpi,
    });
  }

  // --- Insert everything in one transaction --------------------------------
  const counts = {
    patients: 0,
    encounters: 0,
    conditions: 0,
    observations: 0,
    procedures: 0,
    documents: 0,
    providers: 0,
    eligibility: 0,
    claims: 0,
  };

  const seedAll = db.transaction(() => {
    for (const provider of orgProviders.values()) {
      insertProvider.run(
        provider.npi,
        "org",
        provider.name,
        provider.taxonomy,
        provider.tin,
        JSON.stringify(provider.address),
        null,
      );
      counts.providers++;
    }
    for (const provider of individualProviders.values()) {
      insertProvider.run(
        provider.npi,
        "individual",
        `${provider.first_name} ${provider.last_name}`,
        provider.taxonomy,
        null,
        null,
        provider.sourceNpi,
      );
      counts.providers++;
    }

    for (const record of records) {
      const encounter = encounterOf(record);
      const related = record.encounter_fhir.related_resources ?? {};
      const patient = record.patient_context.patient;
      const patientId: string = patient.id;
      const encounterId: string = encounter.id;

      const officialName =
        (patient.name ?? []).find((n: any) => n.use === "official") ??
        patient.name?.[0] ??
        {};
      const address = patient.address?.[0] ?? {};
      const conditionLabels =
        record.patient_context.longitudinal_summary?.condition_labels ?? [];

      insertPatient.run(
        patientId,
        cleanName(officialName.family ?? "Unknown"),
        cleanName(officialName.given?.[0] ?? "Unknown"),
        officialName.prefix?.[0] ?? null,
        patient.gender ?? "unknown",
        patient.birthDate ?? "",
        patient.maritalStatus?.text ?? null,
        address.city ?? null,
        address.state ?? null,
        address.country ?? null,
        JSON.stringify(conditionLabels),
      );
      counts.patients++;

      const typeCoding = encounter?.type?.[0]?.coding?.[0] ?? {};
      const { npi: sourceNpi, display: practitionerDisplay } =
        practitionerRefOf(record);
      const orgName: string =
        encounter?.serviceProvider?.display ?? "Unknown Organization";

      insertEncounter.run(
        encounterId,
        patientId,
        String(record.metadata.date).slice(0, 10),
        encounter?.period?.start ?? record.metadata.date,
        encounter?.period?.end ?? record.metadata.date,
        encounter?.class?.code ?? "AMB",
        typeCoding.code ?? null,
        typeCoding.display ?? null,
        record.metadata.visit_title,
        encounter?.status ?? null,
        cleanName(practitionerDisplay),
        sourceNpi,
        orgName,
      );
      counts.encounters++;

      for (const condition of related.Condition ?? []) {
        const coding = condition?.code?.coding?.[0] ?? {};
        insertCondition.run(
          encounterId,
          patientId,
          coding.code ?? null,
          coding.display ?? null,
          condition?.onsetDateTime ?? null,
          condition?.clinicalStatus?.coding?.[0]?.code ?? null,
        );
        counts.conditions++;
      }

      for (const observation of related.Observation ?? []) {
        const coding = observation?.code?.coding?.[0] ?? {};
        const effective = observation?.effectiveDateTime ?? null;
        if (Array.isArray(observation?.component)) {
          insertObservation.run(
            encounterId,
            coding.code ?? null,
            coding.display ?? null,
            "",
            null,
            effective,
          );
          counts.observations++;
          for (const component of observation.component) {
            const componentCoding = component?.code?.coding?.[0] ?? {};
            const quantity = component?.valueQuantity;
            insertObservation.run(
              encounterId,
              componentCoding.code ?? null,
              componentCoding.display ?? null,
              quantity ? String(quantity.value) : "",
              quantity?.unit ?? null,
              effective,
            );
            counts.observations++;
          }
          continue;
        }
        const quantity = observation?.valueQuantity;
        const codeable = observation?.valueCodeableConcept;
        const valueText = quantity
          ? String(quantity.value)
          : (codeable?.coding?.[0]?.display ?? codeable?.text ?? "");
        insertObservation.run(
          encounterId,
          coding.code ?? null,
          coding.display ?? null,
          valueText,
          quantity?.unit ?? null,
          effective,
        );
        counts.observations++;
      }

      for (const procedure of related.Procedure ?? []) {
        const coding = procedure?.code?.coding?.[0] ?? {};
        insertProcedure.run(
          encounterId,
          coding.code ?? null,
          coding.display ?? null,
          procedure?.performedPeriod?.start ?? null,
          procedure?.performedPeriod?.end ?? null,
        );
        counts.procedures++;
      }

      insertDocument.run(
        encounterId,
        record.transcript,
        record.note,
        record.after_visit_summary ?? null,
      );
      counts.documents++;

      // Eligibility: active since Jan 1 of the year before the encounter.
      const encounterYear = Number(String(record.metadata.date).slice(0, 4));
      const memberId = generateMbi(`member:${patientId}`);
      insertEligibility.run(
        memberId,
        patientId,
        payer.payer_id,
        "Medicare Part B (Mock)",
        "MOCK-GRP-01",
        `${encounterYear - 1}-01-01`,
      );
      counts.eligibility++;

      // Draft claim.
      const orgProvider = orgProviders.get(orgName)!;
      const renderingProvider = individualProviders.get(sourceNpi)!;
      const claim = buildDraftClaim({
        record,
        orgProvider,
        renderingProvider,
        payer,
        eligibility: { member_id: memberId, group_number: "MOCK-GRP-01" },
      });
      const claimJson = JSON.stringify(claim);
      insertClaim.run(
        `clm-${encounterId.slice(0, 8)}`,
        encounterId,
        patientId,
        claimJson,
        claimJson,
        now,
        now,
      );
      counts.claims++;
    }
  });
  seedAll();

  // --- Golden claim assertions ---------------------------------------------
  const GOLDEN_ENCOUNTER = "4b4735a2-ee12-ec86-c1c9-c610cc6ef8ab";
  const goldenRow = db
    .prepare("SELECT claim_json FROM claims WHERE encounter_id = ?")
    .get(GOLDEN_ENCOUNTER) as { claim_json: string } | undefined;

  const failures: string[] = [];
  if (!goldenRow) {
    failures.push("golden claim row not found");
  } else {
    const golden = JSON.parse(goldenRow.claim_json);
    const dxCodes = new Set(
      golden.diagnoses.map((d: { code: string }) => d.code),
    );
    for (const expected of [
      "I10",
      "E88.81",
      "E66.9",
      "Z68.30",
      "K05.10",
      "Z13.31",
      "Z13.89",
    ]) {
      if (!dxCodes.has(expected)) failures.push(`missing dx ${expected}`);
    }
    const lines = golden.service_lines as {
      cpt: string;
      charge: number;
    }[];
    if (lines.length !== 3) {
      failures.push(`expected 3 service lines, got ${lines.length}`);
    }
    const expectLine = (cpt: string, charge: number) => {
      const line = lines.find((l) => l.cpt === cpt);
      if (!line) failures.push(`missing line ${cpt}`);
      else if (line.charge !== charge)
        failures.push(`line ${cpt} charge ${line.charge}, expected ${charge}`);
    };
    expectLine("99204", 175);
    expectLine("G0444", 18);
    expectLine("G0442", 18);
    if (golden.total_charge !== 211)
      failures.push(`total_charge ${golden.total_charge}, expected 211`);
    if (golden.place_of_service !== "11")
      failures.push(`place_of_service ${golden.place_of_service}, expected 11`);
    if (!isValidNpi(golden.billing_provider.npi))
      failures.push(`billing NPI ${golden.billing_provider.npi} fails Luhn`);
    if (!isValidNpi(golden.rendering_provider.npi))
      failures.push(`rendering NPI ${golden.rendering_provider.npi} fails Luhn`);
  }

  console.log("Seed complete:");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(13)} ${count}`);
  }
  if (goldenRow) {
    const golden = JSON.parse(goldenRow.claim_json);
    console.log(
      `Golden claim (encounter ${GOLDEN_ENCOUNTER.slice(0, 8)}): ` +
        `${golden.service_lines
          .map((l: { cpt: string; charge: number }) => `${l.cpt} $${l.charge}`)
          .join(", ")} | total $${golden.total_charge} | POS ${golden.place_of_service} | ` +
        `dx [${golden.diagnoses.map((d: { code: string }) => d.code).join(", ")}]`,
    );
  }

  if (failures.length > 0) {
    console.error("GOLDEN CLAIM ASSERTIONS FAILED:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log("Golden claim assertions passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
