// Shared plumbing for the clinical-layer specialist agents (server-only).
//
// The clinical layer is a map-reduce of focused specialists (correct-coding,
// medical-necessity, diagnosis-quality). Each specialist declares a system
// prompt, the data-tool groups it needs, and a deterministic mock. This module
// owns everything they share: encounter-document loading, the Claude Agent SDK
// runner, the report_finding / report_confidence tools, and the credential check.
import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { getDb } from "../db";
import type { Claim837P, ClaimFinding, SpecialistId } from "../types";
import type { FindingDraft } from "../validate";
import { getRule, clinicalRulesForPrompt } from "../rules";
import {
  listNcciSections,
  searchNcci,
  readNcciSection,
  chaptersForCpts,
} from "../ncci";

export type ClinicalAssessment = { score: number; rationale: string };

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

// ---------------------------------------------------------------------------
// Encounter documentation (the "source data" specialists cross-check against)
// ---------------------------------------------------------------------------

export type EncounterDocs = {
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

export function loadEncounterDocs(encounterId: string): EncounterDocs {
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

/** True when the claim has real encounter documentation to cross-check against. */
export function hasDocumentation(docs: EncounterDocs): boolean {
  return Boolean(
    docs.note.trim() ||
      docs.transcript.trim() ||
      docs.conditions.length ||
      docs.observations.length ||
      docs.procedures.length,
  );
}

// ---------------------------------------------------------------------------
// Specialist contract
// ---------------------------------------------------------------------------

export type SpecialistContext = {
  claim: Claim837P;
  claimId: string;
  encounterId: string;
  docs: EncounterDocs;
  hasDocs: boolean;
  deterministicFindings: ClaimFinding[];
  emit: (text: string) => void; // activity line (orchestrator prefixes the agent)
};

export type SpecialistOutput = {
  assessment: ClinicalAssessment | null;
  // Drafts without the `agent` tag; the orchestrator stamps the specialist id.
  drafts: FindingDraft[];
};

export type Specialist = {
  id: SpecialistId;
  label: string;
  runAgent: (ctx: SpecialistContext) => Promise<SpecialistOutput>;
  runMock: (ctx: SpecialistContext) => Promise<SpecialistOutput>;
};

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

export const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

// Flattens the agent's markdown-ish thoughts into a single clean feed line.
export function cleanActivity(text: string, n = 180): string {
  const flat = text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(flat, n);
}

export function docsContainAny(haystack: string, keywords: string[]): boolean {
  const lower = haystack.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Claude Agent SDK runner (shared by every specialist)
// ---------------------------------------------------------------------------

export type ToolGroup = "claim" | "note" | "transcript" | "fhir" | "rules" | "ncci";

const findingInputSchema = {
  severity: z.enum(["error", "warning", "info"]),
  rule_id: z
    .string()
    .describe("Closest matching rule id (e.g. M-201, or an NCCI PTP edit), if any")
    .optional(),
  issue: z.string().describe("One-sentence statement of the problem"),
  why_it_matters: z
    .string()
    .describe("Why Medicare is likely to deny, downcode, or audit because of this"),
  loop_segment: z
    .string()
    .describe("837P loop/segment reference, e.g. '2400 SV101' or '2300 HI'")
    .optional(),
  field: z
    .string()
    .describe("Exact claim field affected, e.g. 'Service line 2 (CPT 27447)' or 'Diagnosis A (M17.11)'")
    .optional(),
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
    .describe("Probability 0..1 that Medicare accepts this claim as billed, for THIS specialist's concern"),
  rationale: z.string(),
};

/**
 * Runs one specialist as a Claude Agent SDK session. Builds an in-process MCP
 * server exposing only the data tools the specialist asked for, plus the shared
 * report_finding / report_confidence sinks, then streams activity and collects
 * the drafts + confidence the agent produces.
 */
export async function runSdkSpecialist(opts: {
  ctx: SpecialistContext;
  systemPrompt: string;
  toolGroups: ToolGroup[];
  maxTurns?: number;
}): Promise<SpecialistOutput> {
  const { ctx, systemPrompt, toolGroups } = opts;
  const { query, tool, createSdkMcpServer } = await import(
    "@anthropic-ai/claude-agent-sdk"
  );
  const docs = ctx.docs;
  const drafts: FindingDraft[] = [];
  let assessment: ClinicalAssessment | null = null;
  const groups = new Set(toolGroups);

  // tool() returns schema-specific types; the SDK server accepts a heterogeneous
  // array, so collect loosely and cast once at the createSdkMcpServer call.
  const tools: unknown[] = [];
  const names: string[] = [];
  const addTool = (t: unknown, name: string) => {
    tools.push(t);
    names.push(`mcp__claimify__${name}`);
  };

  if (groups.has("claim")) {
    addTool(
      tool(
        "get_claim",
        "The submitted 837P claim (JSON) plus findings already raised by earlier layers/specialists.",
        {},
        async () => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  claim: ctx.claim,
                  earlier_findings: ctx.deterministicFindings.map((f) => ({
                    layer: f.layer,
                    rule_id: f.rule_id,
                    severity: f.severity,
                    field: f.field,
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
      "get_claim",
    );
  }

  if (groups.has("note")) {
    addTool(
      tool(
        "get_clinical_note",
        "The clinician's SOAP note for the encounter this claim bills.",
        {},
        async () => ({
          content: [{ type: "text" as const, text: docs.note || "(no note found)" }],
        }),
      ),
      "get_clinical_note",
    );
  }

  if (groups.has("transcript")) {
    addTool(
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
      "get_transcript",
    );
  }

  if (groups.has("fhir")) {
    addTool(
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
      "get_fhir_context",
    );
  }

  if (groups.has("rules")) {
    addTool(
      tool(
        "get_medical_necessity_rules",
        "The payer's clinical/medical-necessity validation rules for 837P claims.",
        {},
        async () => ({
          content: [{ type: "text" as const, text: clinicalRulesForPrompt() }],
        }),
      ),
      "get_medical_necessity_rules",
    );
  }

  if (groups.has("ncci")) {
    addTool(
      tool(
        "search_ncci_manual",
        "Search the 2025 NCCI Policy Manual for correct-coding policy relevant to this claim's codes/modifiers (PTP edits, modifier 59/25 use, bundling, mutually exclusive procedures, add-on codes, MUEs). Returns cited passages with chapter and line.",
        { query: z.string().describe("codes, modifiers, or policy keywords to look up") },
        async (input) => {
          const passages = searchNcci(input.query, { limit: 6 });
          if (passages.length === 0) {
            return {
              content: [
                { type: "text" as const, text: `No NCCI passages matched "${input.query}".` },
              ],
            };
          }
          const text = passages
            .map((p) => `[${p.section} · line ${p.line}]\n${p.text}`)
            .join("\n\n---\n\n");
          return { content: [{ type: "text" as const, text }] };
        },
      ),
      "search_ncci_manual",
    );
    addTool(
      tool(
        "read_ncci_section",
        'Read a full NCCI manual chapter by id (e.g. "01" general policies, "11" medicine/E&M) when a search hit needs surrounding context. Windowed by character offset.',
        {
          id: z.string().describe('chapter id like "01", slug, or filename'),
          offset: z.number().int().min(0).optional(),
        },
        async (input) => {
          const res = readNcciSection(input.id, { offset: input.offset ?? 0 });
          if (!res) {
            const index = listNcciSections()
              .map((s) => `${s.id} — ${s.title}`)
              .join("\n");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No NCCI section "${input.id}". Available:\n${index}`,
                },
              ],
            };
          }
          const more =
            res.offset + res.length < res.total
              ? `\n\n[…truncated. ${res.total - res.offset - res.length} chars remain; call again with offset=${res.offset + res.length}.]`
              : "";
          return {
            content: [
              { type: "text" as const, text: `# ${res.section}\n\n${res.text}${more}` },
            ],
          };
        },
      ),
      "read_ncci_section",
    );
  }

  // Shared sinks — every specialist reports through these.
  addTool(
    tool(
      "report_finding",
      "Report one validation finding for your concern. Call once per distinct issue, naming the EXACT claim field. Do not repeat issues already raised by earlier layers.",
      findingInputSchema,
      async (input) => {
        const rule = input.rule_id ? getRule(input.rule_id) : undefined;
        drafts.push({
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
        return { content: [{ type: "text" as const, text: "Finding recorded." }] };
      },
    ),
    "report_finding",
  );
  addTool(
    tool(
      "report_confidence",
      "Report the probability Medicare accepts this claim as billed for YOUR concern only, after all findings. Call exactly once, last.",
      confidenceInputSchema,
      async (input) => {
        assessment = { score: input.score, rationale: input.rationale };
        return { content: [{ type: "text" as const, text: "Confidence recorded." }] };
      },
    ),
    "report_confidence",
  );

  const server = createSdkMcpServer({
    name: "claimify",
    version: "1.0.0",
    tools: tools as Parameters<typeof createSdkMcpServer>[0]["tools"],
  });

  const result = query({
    prompt:
      "Validate your concern for this claim now. Use your tools; finish with report_confidence.",
    options: {
      model: process.env.CLAIMIFY_AGENT_MODEL || "claude-opus-4-8",
      systemPrompt,
      mcpServers: { claimify: server },
      allowedTools: names,
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
      maxTurns: opts.maxTurns ?? 30,
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
          ctx.emit(cleanActivity(block.text));
        } else if (block.type === "tool_use" && block.name) {
          ctx.emit(`→ ${block.name.replace("mcp__claimify__", "")}`);
        }
      }
    }
  }

  return { assessment, drafts };
}

/** Human-readable list of the NCCI chapters relevant to this claim's codes. */
export function relevantNcciChaptersText(claim: Claim837P): string {
  const cpts = claim.service_lines.map((l) => l.cpt).filter(Boolean);
  const chapters = chaptersForCpts(cpts);
  if (chapters.length === 0) return "(NCCI manual not available)";
  return chapters.map((c) => `${c.id} — ${c.title}`).join("; ");
}
