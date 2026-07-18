// Medicare-acceptance confidence scoring. Deterministic findings set the
// ceiling; the clinical assessment (agent or mock) refines within it.
import type { ClaimFinding, ConfidenceReport } from "./types";

type ScoredFinding = Pick<ClaimFinding, "layer" | "severity">;

const BASE = 0.95;

function count(
  findings: ScoredFinding[],
  layer: ClaimFinding["layer"],
  severity: ClaimFinding["severity"],
): number {
  return findings.filter((f) => f.layer === layer && f.severity === severity)
    .length;
}

// A structural error means the claim rejects at the clearinghouse before
// adjudication; a content error survives to adjudication but usually denies.
export function structuralCap(findings: ScoredFinding[]): number {
  if (count(findings, "structural", "error") > 0) return 0.1;
  if (count(findings, "content", "error") > 0) return 0.35;
  return 1.0;
}

export function scoreFromFindings(
  findings: ScoredFinding[],
  clinicalAssessment?: { score: number; rationale: string },
): ConfidenceReport {
  const structuralErrors = count(findings, "structural", "error");
  const contentErrors = count(findings, "content", "error");
  const clinicalErrors = count(findings, "clinical", "error");
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const clinicalWarnings = count(findings, "clinical", "warning");
  const nonClinicalWarnings = warnings - clinicalWarnings;

  let deterministic = BASE;
  deterministic -= Math.min(0.5, contentErrors * 0.12);
  deterministic -= Math.min(0.2, nonClinicalWarnings * 0.04);
  deterministic -= clinicalErrors * 0.1;
  deterministic -= clinicalWarnings * 0.05;
  deterministic = Math.max(0.02, deterministic);

  const cap = structuralCap(findings);
  const blended = clinicalAssessment
    ? Math.min(cap, 0.4 * deterministic + 0.6 * clinicalAssessment.score)
    : Math.min(cap, deterministic);
  const score = Math.min(0.98, Math.max(0.02, blended));

  const structuralScore =
    structuralErrors > 0 ? Math.max(0.05, 0.3 - structuralErrors * 0.05) : 0.98;
  const contentScore = Math.max(
    0.05,
    0.95 - contentErrors * 0.2 - nonClinicalWarnings * 0.05,
  );
  const clinicalScore = clinicalAssessment
    ? clinicalAssessment.score
    : Math.max(0.05, 0.9 - clinicalErrors * 0.25 - clinicalWarnings * 0.1);

  const parts: string[] = [];
  if (structuralErrors > 0)
    parts.push(
      `${structuralErrors} structural error(s) that reject at the clearinghouse`,
    );
  if (contentErrors > 0)
    parts.push(`${contentErrors} content/coding error(s)`);
  if (clinicalErrors > 0)
    parts.push(`${clinicalErrors} clinical-support error(s)`);
  if (warnings > 0) parts.push(`${warnings} warning(s)`);
  const rationale =
    parts.length === 0
      ? "No blocking findings. The claim is internally consistent, matches the eligibility and provider registries, and the billed services are supported by the encounter documentation."
      : `Confidence reduced by ${parts.join(", ")}.${
          clinicalAssessment ? ` Clinical review: ${clinicalAssessment.rationale}` : ""
        }`;

  return {
    score: Number(score.toFixed(2)),
    rationale,
    breakdown: [
      {
        category: "Structural integrity",
        score: Number(structuralScore.toFixed(2)),
        note:
          structuralErrors > 0
            ? `${structuralErrors} front-end rejection edit(s) failed.`
            : "All required loops, identifiers, and balancing edits pass.",
      },
      {
        category: "Content & coding",
        score: Number(contentScore.toFixed(2)),
        note:
          contentErrors + nonClinicalWarnings > 0
            ? `${contentErrors} error(s) and ${nonClinicalWarnings} warning(s) across code sets, eligibility, and provider checks.`
            : "Code formats, eligibility, provider registry, and dates all check out.",
      },
      {
        category: "Clinical support",
        score: Number(clinicalScore.toFixed(2)),
        note: clinicalAssessment
          ? clinicalAssessment.rationale
          : clinicalErrors + clinicalWarnings > 0
            ? `${clinicalErrors} error(s), ${clinicalWarnings} warning(s) in documentation support.`
            : "Billed services are grounded in the encounter documentation.",
      },
    ],
  };
}
