// PDF -> 837P extraction (server-only). Reads an uploaded CMS-1500 / 837P PDF
// with Claude's native document understanding and returns a Claim837P for the
// editor to review. Falls back to a deterministic sample when no API key, so the
// import feature demos without credentials (mirrors the layer-3 mock pattern).
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Claim837P } from "./types";

export type ImportEngine = "anthropic" | "mock";

export type ClaimImportResult = {
  claim: Claim837P;
  engine: ImportEngine;
  warnings: string[];
};

// The raw Anthropic SDK needs a real API key; a local `~/.claude` login (which
// the Agent SDK can use) does not supply one. So gate strictly on the key.
export function importCredentialsAvailable(): boolean {
  return process.env.USE_MOCK_AI !== "true" && !!process.env.ANTHROPIC_API_KEY;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Forgiving schema: every field defaults so a partial extraction still yields a
// structurally valid claim the reviewer can correct in the form.
const AddressZ = z
  .object({
    line1: z.string().catch(""),
    city: z.string().catch(""),
    state: z.string().catch(""),
    zip: z.string().catch(""),
  })
  .catch({ line1: "", city: "", state: "", zip: "" });

const ServiceLineZ = z.object({
  line_number: z.coerce.number().catch(0),
  cpt: z.string().catch(""),
  modifiers: z.array(z.string()).catch([]),
  description: z.string().catch(""),
  charge: z.coerce.number().catch(0),
  units: z.coerce.number().catch(1),
  dos_from: z.string().catch(""),
  dos_to: z.string().optional(),
  place_of_service: z.string().optional(),
  diagnosis_pointers: z.array(z.coerce.number()).catch([]),
});

const ClaimZ = z.object({
  patient_control_number: z.string().catch(""),
  total_charge: z.coerce.number().catch(0),
  place_of_service: z.string().catch("11"),
  frequency_code: z.string().catch("1"),
  original_claim_number: z.string().optional(),
  prior_authorization: z.string().optional(),
  onset_date: z.string().optional(),
  diagnoses: z
    .array(
      z.object({
        code: z.string().catch(""),
        description: z.string().catch(""),
      }),
    )
    .catch([]),
  billing_provider: z
    .object({
      organization_name: z.string().catch(""),
      npi: z.string().catch(""),
      tin: z.string().catch(""),
      taxonomy: z.string().catch(""),
      address: AddressZ,
    })
    .catch({
      organization_name: "",
      npi: "",
      tin: "",
      taxonomy: "",
      address: { line1: "", city: "", state: "", zip: "" },
    }),
  rendering_provider: z
    .object({
      npi: z.string().catch(""),
      first_name: z.string().catch(""),
      last_name: z.string().catch(""),
      taxonomy: z.string().catch(""),
    })
    .catch({ npi: "", first_name: "", last_name: "", taxonomy: "" }),
  subscriber: z
    .object({
      member_id: z.string().catch(""),
      group_number: z.string().catch(""),
      last_name: z.string().catch(""),
      first_name: z.string().catch(""),
      dob: z.string().catch(""),
      gender: z.enum(["M", "F", "U"]).catch("U"),
      relationship_code: z.string().catch("18"),
      address: AddressZ,
    })
    .catch({
      member_id: "",
      group_number: "",
      last_name: "",
      first_name: "",
      dob: "",
      gender: "U",
      relationship_code: "18",
      address: { line1: "", city: "", state: "", zip: "" },
    }),
  payer: z
    .object({
      payer_id: z.string().catch(""),
      name: z.string().catch(""),
      claim_filing_indicator: z.string().catch("MB"),
    })
    .catch({ payer_id: "", name: "", claim_filing_indicator: "MB" }),
  service_lines: z.array(ServiceLineZ).catch([]),
});

// The CMS-1500 (02/12) box -> Claim837P field map, injected into the prompt so
// Claude maps each numbered box to the right field.
const EXTRACTION_PROMPT = [
  "This PDF is a completed professional medical claim — either a CMS-1500 (02/12) paper form (numbered boxes 1–33) or a human-readable 837P printout. Extract its field values into a single JSON object.",
  "",
  "Return ONLY a JSON object matching this exact shape (no prose, no markdown fences):",
  `{
  "patient_control_number": "",   // Box 26 (patient account no.)
  "total_charge": 0,              // Box 28 (total charge), number
  "place_of_service": "",        // Box 24B (2-digit POS; use the most common line value as the claim default)
  "frequency_code": "1",         // Box 22 resubmission code: 1 original, 7 replacement, 8 void
  "original_claim_number": "",    // Box 22 original ref. no. (omit if none)
  "prior_authorization": "",      // Box 23 (omit if none)
  "onset_date": "",               // Box 14 date of current illness, YYYY-MM-DD (omit if none)
  "diagnoses": [                   // Box 21 A–L, in order
    { "code": "", "description": "" }
  ],
  "billing_provider": {            // Box 33 / 33a / 33b / 25
    "organization_name": "",      // Box 33
    "npi": "",                    // Box 33a
    "tin": "",                    // Box 25 (federal tax ID)
    "taxonomy": "",               // Box 33b
    "address": { "line1": "", "city": "", "state": "", "zip": "" }  // Box 33
  },
  "rendering_provider": {          // Box 24J NPI; name if present
    "npi": "", "first_name": "", "last_name": "", "taxonomy": ""
  },
  "subscriber": {                  // patient (self): Box 2/3/5/6, insured ID Box 1a, group Box 11
    "member_id": "",              // Box 1a (Medicare Beneficiary Identifier)
    "group_number": "",          // Box 11
    "last_name": "", "first_name": "",
    "dob": "",                    // Box 3, YYYY-MM-DD
    "gender": "U",                // Box 3: "M" | "F" | "U"
    "relationship_code": "18",    // Box 6 (18 = self)
    "address": { "line1": "", "city": "", "state": "", "zip": "" }  // Box 5
  },
  "payer": {                       // carrier block + Box 1
    "payer_id": "", "name": "",
    "claim_filing_indicator": "MB" // Box 1: MB = Medicare Part B
  },
  "service_lines": [               // Box 24, one object per line
    {
      "line_number": 1,
      "cpt": "",                  // Box 24D CPT/HCPCS
      "modifiers": [],            // Box 24D modifiers
      "description": "",
      "charge": 0,                // Box 24F, number
      "units": 1,                 // Box 24G days/units
      "dos_from": "",             // Box 24A from date, YYYY-MM-DD
      "dos_to": "",               // Box 24A to date (omit if same)
      "place_of_service": "",     // Box 24B (omit if same as claim default)
      "diagnosis_pointers": [1]   // Box 24E: convert letters A–L to 1-based numbers (A=1..L=12)
    }
  ]
}`,
  "",
  "Rules:",
  "- All dates as YYYY-MM-DD.",
  "- Money as plain numbers (no $ or commas).",
  "- diagnosis_pointers are 1-based integers mapping to the diagnoses array order (A=1, B=2, …).",
  "- Include a service_lines entry for every line present. Omit optional fields you cannot find rather than guessing.",
  "- Do not invent values that are not on the form. Leave unknown strings empty.",
  "- Output ONLY the JSON object.",
].join("\n");

function parseClaimJson(raw: string): Claim837P {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model response did not contain a JSON object.");
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  return normalize(ClaimZ.parse(parsed));
}

// Renumber lines, backfill the claim total from the line sum when missing, cap
// diagnoses at 12, and drop dangling pointers.
function normalize(claim: Claim837P): Claim837P {
  claim.diagnoses = claim.diagnoses.slice(0, 12);
  const dxCount = claim.diagnoses.length;
  claim.service_lines = claim.service_lines.map((line, i) => ({
    ...line,
    line_number: i + 1,
    units: line.units > 0 ? line.units : 1,
    modifiers: line.modifiers.filter(Boolean).map((m) => m.trim().toUpperCase()),
    diagnosis_pointers: Array.from(new Set(line.diagnosis_pointers))
      .filter((p) => p >= 1 && p <= dxCount)
      .sort((a, b) => a - b),
  }));
  const lineSum = round2(
    claim.service_lines.reduce((s, l) => s + (l.charge || 0), 0),
  );
  if (!claim.total_charge || claim.total_charge <= 0) {
    claim.total_charge = lineSum;
  }
  return claim;
}

async function extractWithAnthropic(pdfBase64: string): Promise<Claim837P> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: process.env.CLAIMIFY_AGENT_MODEL || "claude-opus-4-8",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in the model response.");
  }
  return parseClaimJson(textBlock.text);
}

// Deterministic sample used when no API key is present (or extraction fails), so
// the "Import from PDF" flow always populates the form for the demo.
function mockClaim(): Claim837P {
  return {
    patient_control_number: "PCN-IMPORT-0001",
    total_charge: 211,
    place_of_service: "11",
    frequency_code: "1",
    onset_date: undefined,
    diagnoses: [
      { code: "I10", description: "Essential (primary) hypertension" },
      { code: "E66.9", description: "Obesity, unspecified" },
      { code: "Z13.31", description: "Screening for depression" },
    ],
    billing_provider: {
      organization_name: "Riverbend Family Medicine",
      npi: "1215930367",
      tin: "94-3172651",
      taxonomy: "207Q00000X",
      address: {
        line1: "480 Cedar Grove Ave",
        city: "Springfield",
        state: "OR",
        zip: "97477",
      },
    },
    rendering_provider: {
      npi: "1215930367",
      first_name: "Dana",
      last_name: "Okafor",
      taxonomy: "207Q00000X",
    },
    subscriber: {
      member_id: "1EG4TE5MK73",
      group_number: "",
      last_name: "Sample",
      first_name: "Patient",
      dob: "1971-04-12",
      gender: "M",
      relationship_code: "18",
      address: {
        line1: "77 Willow Lane",
        city: "Springfield",
        state: "OR",
        zip: "97477",
      },
    },
    payer: {
      payer_id: "MEDICARE",
      name: "Medicare Part B",
      claim_filing_indicator: "MB",
    },
    service_lines: [
      {
        line_number: 1,
        cpt: "99204",
        modifiers: [],
        description: "Office/outpatient visit, new patient, moderate MDM",
        charge: 175,
        units: 1,
        dos_from: "2026-07-10",
        diagnosis_pointers: [1, 2],
      },
      {
        line_number: 2,
        cpt: "G0444",
        modifiers: [],
        description: "Annual depression screening, 15 min",
        charge: 18,
        units: 1,
        dos_from: "2026-07-10",
        diagnosis_pointers: [3],
      },
      {
        line_number: 3,
        cpt: "G0442",
        modifiers: [],
        description: "Annual alcohol misuse screening, 15 min",
        charge: 18,
        units: 1,
        dos_from: "2026-07-10",
        diagnosis_pointers: [1],
      },
    ],
  };
}

export async function extractClaimFromPdf(
  pdfBase64: string,
): Promise<ClaimImportResult> {
  if (!importCredentialsAvailable()) {
    return {
      claim: mockClaim(),
      engine: "mock",
      warnings: [
        "No ANTHROPIC_API_KEY set — loaded a sample claim instead of parsing the PDF. Set an API key to extract real values.",
      ],
    };
  }
  try {
    const claim = await extractClaimFromPdfStrict(pdfBase64);
    return { claim, engine: "anthropic", warnings: warningsFor(claim) };
  } catch (error) {
    return {
      claim: mockClaim(),
      engine: "mock",
      warnings: [
        `PDF extraction failed (${error instanceof Error ? error.message : "unknown error"}); loaded a sample claim so you can continue.`,
      ],
    };
  }
}

async function extractClaimFromPdfStrict(
  pdfBase64: string,
): Promise<Claim837P> {
  return extractWithAnthropic(pdfBase64);
}

// Surface likely-empty required fields so the reviewer knows what to check.
function warningsFor(claim: Claim837P): string[] {
  const warnings: string[] = [];
  if (!claim.subscriber.member_id)
    warnings.push("Insured's ID (Box 1a) was not found — verify it.");
  if (!claim.billing_provider.npi)
    warnings.push("Billing provider NPI (Box 33a) was not found — verify it.");
  if (claim.diagnoses.length === 0)
    warnings.push("No diagnosis codes (Box 21) were extracted.");
  if (claim.service_lines.length === 0)
    warnings.push("No service lines (Box 24) were extracted.");
  return warnings;
}
