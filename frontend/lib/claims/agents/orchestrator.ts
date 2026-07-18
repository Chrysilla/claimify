// Clinical-layer orchestrator: runs the specialist agents as a parallel
// map-reduce. MAP — each specialist cross-checks the claim (form data) against
// the source data + the rules it owns, in its own SDK session, falling back to
// a deterministic mock. REDUCE — dedupe findings across specialists, tag each
// with its author, and blend the per-specialist confidences into one score.
import type { Claim837P, ClaimFinding, SpecialistId } from "../types";
import { SPECIALIST_LABELS } from "../types";
import type { FindingDraft } from "../validate";
import {
  type ClinicalAssessment,
  type Specialist,
  type SpecialistContext,
  hasDocumentation,
  loadEncounterDocs,
  truncate,
} from "./shared";
import { codingSpecialist } from "./coding";
import { necessitySpecialist } from "./necessity";
import { diagnosisSpecialist } from "./diagnosis";

export { agentCredentialsAvailable } from "./shared";
export type { ClinicalAssessment } from "./shared";

// Order controls the specialist strip + activity feed.
const SPECIALISTS: Specialist[] = [
  codingSpecialist,
  necessitySpecialist,
  diagnosisSpecialist,
];

export type ClinicalRunOptions = {
  engine: "agent" | "mock";
  claim: Claim837P;
  claimId: string;
  encounterId: string;
  deterministicFindings: ClaimFinding[];
  addFinding: (draft: FindingDraft) => ClaimFinding;
  emitActivity: (text: string) => void;
  emitAgentStart: (agent: SpecialistId, label: string) => void;
  emitAgentDone: (
    agent: SpecialistId,
    state: "pass" | "fail" | "skipped",
    errors: number,
    warnings: number,
  ) => void;
};

type SpecialistResult = {
  id: SpecialistId;
  assessment: ClinicalAssessment | null;
  engineUsed: "agent" | "mock";
};

// Cross-specialist dedupe key: same field + same issue opening = same finding.
function dedupeKey(d: Pick<FindingDraft, "field" | "issue">): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(d.field ?? "")}::${norm(d.issue).slice(0, 60)}`;
}

function combineAssessments(results: SpecialistResult[]): ClinicalAssessment | null {
  const scored = results.filter((r) => r.assessment);
  if (scored.length === 0) return null;
  // Weakest link: a serious problem in any one dimension should lower acceptance.
  const score = Math.min(...scored.map((r) => r.assessment!.score));
  const rationale = scored
    .map((r) => `${SPECIALIST_LABELS[r.id]}: ${r.assessment!.rationale}`)
    .join(" ");
  return { score: Number(score.toFixed(2)), rationale };
}

export async function runClinicalValidation(
  opts: ClinicalRunOptions,
): Promise<{ assessment: ClinicalAssessment | null; engineUsed: "agent" | "mock" }> {
  const docs = loadEncounterDocs(opts.encounterId);
  const hasDocs = hasDocumentation(docs);

  // Findings already on the claim (deterministic + committed specialists) — the
  // reduce step dedupes new drafts against this. Mutated synchronously on commit,
  // so parallel specialists never interleave mid-commit.
  const inserted: ClaimFinding[] = [...opts.deterministicFindings];

  const baseCtx: Omit<SpecialistContext, "emit"> = {
    claim: opts.claim,
    claimId: opts.claimId,
    encounterId: opts.encounterId,
    docs,
    hasDocs,
    deterministicFindings: opts.deterministicFindings,
  };

  const runOne = async (spec: Specialist): Promise<SpecialistResult> => {
    opts.emitAgentStart(spec.id, spec.label);
    const emit = (text: string) => opts.emitActivity(`[${spec.label}] ${text}`);
    const ctx: SpecialistContext = { ...baseCtx, emit };

    let output = { assessment: null as ClinicalAssessment | null, drafts: [] as FindingDraft[] };
    let engineUsed: "agent" | "mock" = "mock";
    try {
      if (opts.engine === "agent") {
        try {
          emit("starting clinical review…");
          output = await spec.runAgent(ctx);
          engineUsed = "agent";
        } catch (error) {
          emit(
            `Claude agent unavailable (${
              error instanceof Error ? truncate(error.message, 100) : "unknown error"
            }) — falling back to mock engine.`,
          );
          output = await spec.runMock(ctx);
          engineUsed = "mock";
        }
      } else {
        output = await spec.runMock(ctx);
        engineUsed = "mock";
      }
    } catch (error) {
      emit(
        `specialist error (${
          error instanceof Error ? truncate(error.message, 100) : "unknown"
        }) — skipped.`,
      );
      opts.emitAgentDone(spec.id, "skipped", 0, 0);
      return { id: spec.id, assessment: null, engineUsed };
    }

    // REDUCE (per specialist): dedupe, tag with author, persist + stream.
    let errors = 0;
    let warnings = 0;
    for (const draft of output.drafts) {
      if (inserted.some((f) => dedupeKey(f) === dedupeKey(draft))) continue;
      const finding = opts.addFinding({ ...draft, agent: spec.id });
      inserted.push(finding);
      if (finding.severity === "error") errors += 1;
      else if (finding.severity === "warning") warnings += 1;
    }
    opts.emitAgentDone(spec.id, errors > 0 ? "fail" : "pass", errors, warnings);
    return { id: spec.id, assessment: output.assessment, engineUsed };
  };

  const results = await Promise.all(SPECIALISTS.map(runOne));

  const engineUsed = results.some((r) => r.engineUsed === "agent") ? "agent" : "mock";
  return { assessment: combineAssessments(results), engineUsed };
}
