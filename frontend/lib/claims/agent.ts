// Layer-3 clinical-evidence validation: Claude Agent SDK runner with a
// deterministic mock fallback so the demo works without credentials.
import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { getDb } from "./db";
import type { Claim837P, ClaimFinding } from "./types";
import type { FindingDraft } from "./validate";
import { clinicalRulesForPrompt, getRule } from "./rules";
import { CPT_EVIDENCE_KEYWORDS, ICD10_EVIDENCE_KEYWORDS } from "./overlays";

export type ClinicalAssessment = { score: number; rationale: string };

export type ClinicalRunOptions = {
  engine: "agent" | "mock";
  claim: Claim837P;
  claimId: string;
  encounterId: string;
  deterministicFindings: ClaimFinding[];
  addFinding: (draft: FindingDraft) => ClaimFinding;
  emitActivity: (text: string) => void;
};

export function agentCredentialsAvailable(): boolean {
  if (process.env.USE_MOCK_AI === "true") return false;
  if (process.env.ANTHROPIC_API_KEY) return true;
  if (process.env.CLAIMIFY_FORCE_AGENT === "1") return true;
  try {
    return fs.existsSync(path.join(os.homedir(), ".claude"));
  } catch {
    return false;
  }
}

type EncounterDocs = {
  note: string;
  transcript: string;
  periodStart: string;
  periodEnd: string;
  visitTitle: string;
  conditions: { snomed: string; display: string; clinical_status: string }[];
  procedures: { snomed: string; display: string; performed_start: string }[];
  observations: { loinc: string; display: string; value_text: string; unit: string }[];
  patient: { family: string; given: string; gender: string; birth_date: string } | null;
};

function loadEncounterDocs(encounterId: string): EncounterDocs {
  const db = getDb();
  const doc = db
    .prepare("SELECT transcript, note FROM documents WHERE encounter_id = ?")
    .get(encounterId) as { transcript: string; note: string } | undefined;
  const enc = db
    .prepare(
      "SELECT period_start, period_end, visit_title, patient_id FROM encounters WHERE id = ?",
    )
    .get(encounterId) as
    | { period_start: string; period_end: string; visit_title: string; patient_id: string }
    | undefined;
  const patient = enc
    ? (db
        .prepare("SELECT family, given, gender, birth_date FROM patients WHERE id = ?")
        .get(enc.patient_id) as EncounterDocs["patient"])
    : null;
  return {
    note: doc?.note ?? "",
    transcript: doc?.transcript ?? "",
    periodStart: enc?.period_start ?? "",
    periodEnd: enc?.period_end ?? "",
    visitTitle: enc?.visit_title ?? "",
    conditions: db
      .prepare(
        "SELECT snomed, display, clinical_status FROM conditions WHERE encounter_id = ?",
      )
      .all(encounterId) as EncounterDocs["conditions"],
    procedures: db
      .prepare(
        "SELECT snomed, display, performed_start FROM procedures WHERE encounter_id = ?",
      )
      .all(encounterId) as EncounterDocs["procedures"],
    observations: db
      .prepare(
        "SELECT loinc, display, value_text, unit FROM observations WHERE encounter_id = ?",
      )
      .all(encounterId) as EncounterDocs["observations"],
    patient,
  };
}

const findingInputSchema = {
  severity: z.enum(["error", "warning", "info"]),
  rule_id: z
    .string()
    .describe("Closest matching clinical rule id (M-201..M-206), if any")
    .optional(),
  issue: z.string().describe("One-sentence statement of the problem"),
  why_it_matters: z
    .string()
    .describe("Why Medicare is likely to deny or downcode because of this"),
  loop_segment: z
    .string()
    .describe("837P loop/segment reference, e.g. '2400 SV101' or '2300 HI'")
    .optional(),
  field: z.string().describe("Claim field affected, e.g. service line 2 CPT").optional(),
  evidence: z
    .array(
      z.object({
        source_type: z.enum(["note", "transcript", "fhir", "claim", "rule"]),
        source_id: z.string(),
        label: z.string(),
        excerpt: z.string().describe("Verbatim quote or precise description"),
      }),
    )
    .min(1),
  recommended_fix: z.string(),
};

const confidenceInputSchema = {
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Probability 0..1 that Medicare accepts this claim as billed"),
  rationale: z.string(),
};

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

// Flattens the agent's markdown-ish thoughts into a single clean feed line.
function cleanActivity(text: string, n = 180): string {
  const flat = text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(flat, n);
}

async function runAgent(opts: ClinicalRunOptions): Promise<ClinicalAssessment | null> {
  const { query, tool, createSdkMcpServer } = await import(
    "@anthropic-ai/claude-agent-sdk"
  );
  const docs = loadEncounterDocs(opts.encounterId);
  let assessment: ClinicalAssessment | null = null;

  const server = createSdkMcpServer({
    name: "claimify",
    version: "1.0.0",
    tools: [
      tool(
        "get_claim",
        "The submitted 837P claim (JSON) plus findings already raised by the deterministic structural/content layers.",
        {},
        async () => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  claim: opts.claim,
                  earlier_findings: opts.deterministicFindings.map((f) => ({
                    layer: f.layer,
                    rule_id: f.rule_id,
                    severity: f.severity,
                    issue: f.issue,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        }),
      ),
      tool(
        "get_clinical_note",
        "The clinician's SOAP note for the encounter this claim bills.",
        {},
        async () => ({
          content: [{ type: "text" as const, text: docs.note || "(no note found)" }],
        }),
      ),
      tool(
        "get_transcript",
        "The word-for-word ambient transcript of the clinician-patient conversation.",
        {},
        async () => ({
          content: [
            { type: "text" as const, text: docs.transcript || "(no transcript found)" },
          ],
        }),
      ),
      tool(
        "get_fhir_context",
        "Structured FHIR context recorded at this encounter: conditions, procedures, observations, encounter period, patient demographics.",
        {},
        async () => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  visit_title: docs.visitTitle,
                  period: { start: docs.periodStart, end: docs.periodEnd },
                  patient: docs.patient,
                  conditions: docs.conditions,
                  procedures: docs.procedures,
                  observations: docs.observations,
                },
                null,
                2,
              ),
            },
          ],
        }),
      ),
      tool(
        "get_medical_necessity_rules",
        "The payer's clinical/medical-necessity validation rules for 837P claims.",
        {},
        async () => ({
          content: [{ type: "text" as const, text: clinicalRulesForPrompt() }],
        }),
      ),
      tool(
        "report_finding",
        "Report one clinical-evidence validation finding. Call once per distinct issue, as soon as you confirm it.",
        findingInputSchema,
        async (input) => {
          const rule = input.rule_id ? getRule(input.rule_id) : undefined;
          opts.addFinding({
            layer: "clinical",
            rule_id: input.rule_id ?? null,
            severity: input.severity,
            loop_segment: input.loop_segment ?? rule?.loop_segment ?? null,
            field: input.field ?? null,
            issue: input.issue,
            why_it_matters: input.why_it_matters,
            evidence: input.evidence,
            recommended_fix: input.recommended_fix,
          });
          return {
            content: [{ type: "text" as const, text: "Finding recorded." }],
          };
        },
      ),
      tool(
        "report_confidence",
        "Report the final probability that Medicare accepts this claim as billed, after all findings are reported. Call exactly once, last.",
        confidenceInputSchema,
        async (input) => {
          assessment = { score: input.score, rationale: input.rationale };
          return {
            content: [{ type: "text" as const, text: "Confidence recorded." }],
          };
        },
      ),
    ],
  });

  const toolNames = [
    "mcp__claimify__get_claim",
    "mcp__claimify__get_clinical_note",
    "mcp__claimify__get_transcript",
    "mcp__claimify__get_fhir_context",
    "mcp__claimify__get_medical_necessity_rules",
    "mcp__claimify__report_finding",
    "mcp__claimify__report_confidence",
  ];

  const systemPrompt = `You are Claimify's clinical-evidence validator for 837P professional claims, reviewing claims before submission to Medicare.

The deterministic layers already checked structure and coding formats. Your job is layer 3 only: is every billed service and every pointed diagnosis actually supported by the encounter documentation?

Method:
1. Read the claim (get_claim), then the clinical note, transcript, and FHIR context, plus the medical-necessity rules.
2. For EACH service line: verify the documentation supports that the service was performed and medically necessary. For E/M codes, check the documented time (encounter period) and complexity plausibly support the level billed.
3. For EACH diagnosis referenced by a pointer: verify it is documented in this encounter (note, transcript, or FHIR conditions/observations).
4. Report every confirmed issue via report_finding with verbatim evidence excerpts (quote the note/transcript). Do not report issues the earlier layers already raised. If everything is supported, report no findings.
5. Finish with exactly one report_confidence call: the probability Medicare accepts the claim as billed, considering your findings AND the earlier layers' findings (structural errors make acceptance nearly impossible; unsupported services usually cause line denials).

Be precise and cite real excerpts. Never invent documentation that is not there.`;

  const result = query({
    prompt:
      "Validate the clinical evidence for this claim now. Use your tools; finish with report_confidence.",
    options: {
      model: process.env.CLAIMIFY_AGENT_MODEL || "claude-opus-4-8",
      systemPrompt,
      mcpServers: { claimify: server },
      allowedTools: toolNames,
      disallowedTools: [
        "Bash",
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "WebSearch",
        "WebFetch",
        "Task",
        "NotebookEdit",
      ],
      permissionMode: "bypassPermissions",
      maxTurns: 40,
      persistSession: false,
      cwd: process.cwd(),
    },
  });

  for await (const message of result) {
    if (message.type === "assistant") {
      const content = (message as { message?: { content?: unknown } }).message
        ?.content as { type: string; text?: string; name?: string }[] | undefined;
      const blocks = Array.isArray(content)
        ? content
        : ((message as unknown as { content?: [] }).content ?? []);
      for (const block of blocks as { type: string; text?: string; name?: string }[]) {
        if (block.type === "text" && block.text?.trim()) {
          opts.emitActivity(cleanActivity(block.text));
        } else if (block.type === "tool_use" && block.name) {
          opts.emitActivity(`→ ${block.name.replace("mcp__claimify__", "")}`);
        }
      }
    }
  }
  return assessment;
}

const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));

function docsContainAny(haystack: string, keywords: string[]): boolean {
  const lower = haystack.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

async function runMock(opts: ClinicalRunOptions): Promise<ClinicalAssessment> {
  const docs = loadEncounterDocs(opts.encounterId);
  const corpus = `${docs.note}\n${docs.transcript}`;
  let errors = 0;
  const warnings = 0;

  opts.emitActivity("Mock engine: reading clinical note and transcript…");
  await SLEEP(400);

  for (const line of opts.claim.service_lines) {
    opts.emitActivity(
      `Cross-checking service line ${line.line_number} (${line.cpt}) against documentation…`,
    );
    await SLEEP(350);
    const keywords = CPT_EVIDENCE_KEYWORDS[line.cpt];
    if (keywords && !docsContainAny(corpus, keywords)) {
      errors += 1;
      const rule = getRule("M-201");
      opts.addFinding({
        layer: "clinical",
        rule_id: "M-201",
        severity: "error",
        loop_segment: "2400 SV101",
        field: `Service line ${line.line_number} (${line.cpt})`,
        issue: `Billed procedure ${line.cpt} (${line.description}) is not supported by the encounter documentation.`,
        why_it_matters:
          rule?.why ??
          "Medicare denies services that the medical record does not document as performed and necessary.",
        evidence: [
          {
            source_type: "note",
            source_id: opts.encounterId,
            label: "Clinical note",
            excerpt: `No documentation matching ${keywords.map((k) => `"${k}"`).join(", ")} found in the note or transcript for this visit (${docs.visitTitle}).`,
          },
        ],
        recommended_fix: `Remove service line ${line.line_number} or add documentation showing ${line.description.toLowerCase()} was performed.`,
      });
    }
    // Time-based upcoding heuristic: high-level or prolonged E/M vs documented duration.
    if (["99205", "99215", "99417"].includes(line.cpt)) {
      const start = Date.parse(docs.periodStart);
      const end = Date.parse(docs.periodEnd);
      const minutes =
        Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 60000 : NaN;
      if (Number.isFinite(minutes) && minutes < 60) {
        errors += 1;
        opts.addFinding({
          layer: "clinical",
          rule_id: "M-203",
          severity: "error",
          loop_segment: "2400 SV101",
          field: `Service line ${line.line_number} (${line.cpt})`,
          issue: `E/M level ${line.cpt} is not supported by the documented encounter time (~${Math.round(minutes)} minutes).`,
          why_it_matters:
            "Time-based E/M levels require documented total time; billing above the documented level is upcoding and a common denial/audit trigger.",
          evidence: [
            {
              source_type: "fhir",
              source_id: opts.encounterId,
              label: "Encounter period",
              excerpt: `Encounter ${docs.periodStart} → ${docs.periodEnd} (~${Math.round(minutes)} minutes documented).`,
            },
          ],
          recommended_fix:
            "Bill the E/M level supported by documented time/complexity (e.g. 99204) or document the additional time.",
        });
      }
    }
  }

  const pointed = new Set<number>();
  for (const line of opts.claim.service_lines) {
    for (const p of line.diagnosis_pointers) pointed.add(p);
  }
  for (const [idx, dx] of opts.claim.diagnoses.entries()) {
    if (!pointed.has(idx + 1)) continue;
    opts.emitActivity(`Verifying diagnosis ${dx.code} against chart evidence…`);
    await SLEEP(300);
    const keywords = ICD10_EVIDENCE_KEYWORDS[dx.code];
    if (keywords && !docsContainAny(corpus, keywords)) {
      errors += 1;
      opts.addFinding({
        layer: "clinical",
        rule_id: "M-202",
        severity: "error",
        loop_segment: "2300 HI",
        field: `Diagnosis ${String.fromCharCode(64 + idx + 1)} (${dx.code})`,
        issue: `Diagnosis ${dx.code} (${dx.description}) is referenced by a service line but is not documented in this encounter.`,
        why_it_matters:
          "Diagnoses on a claim must be documented in the medical record for the date of service; unsupported diagnoses trigger denials and audit risk.",
        evidence: [
          {
            source_type: "note",
            source_id: opts.encounterId,
            label: "Clinical note",
            excerpt: `No mention matching ${keywords.map((k) => `"${k}"`).join(", ")} in the note, transcript, or FHIR conditions for this visit.`,
          },
        ],
        recommended_fix: `Remove diagnosis ${dx.code} (and its pointers) or attach documentation supporting it.`,
      });
    }
  }

  if (errors === 0) {
    opts.emitActivity("All billed services and diagnoses are supported by documentation.");
  }
  await SLEEP(250);

  const score = Math.min(0.95, Math.max(0.1, 0.92 - 0.18 * errors - 0.06 * warnings));
  return {
    score,
    rationale:
      errors === 0
        ? "Every billed service and pointed diagnosis is grounded in the encounter note, transcript, and FHIR record."
        : `${errors} clinical documentation gap(s) found; unsupported services/diagnoses are routinely denied by Medicare.`,
  };
}

export async function runClinicalValidation(
  opts: ClinicalRunOptions,
): Promise<{ assessment: ClinicalAssessment | null; engineUsed: "agent" | "mock" }> {
  if (opts.engine === "agent") {
    try {
      opts.emitActivity("Claude agent: starting clinical-evidence review…");
      const assessment = await runAgent(opts);
      return { assessment, engineUsed: "agent" };
    } catch (error) {
      opts.emitActivity(
        `Claude agent unavailable (${error instanceof Error ? truncate(error.message, 120) : "unknown error"}) — falling back to mock engine.`,
      );
    }
  }
  const assessment = await runMock(opts);
  return { assessment, engineUsed: "mock" };
}
